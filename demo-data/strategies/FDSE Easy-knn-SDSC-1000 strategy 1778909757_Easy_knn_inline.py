"""
EASY Backfilling + KNN walltime prediction — INLINE (single-file) port.

This is the same Easy_knn scheduler ported from fdse-2024 but with the
predictor/knn.py module inlined as private functions, so the strategy can be
uploaded to the portal as a single file (portal stores strategies as flat files,
not directory bundles).

Source (scheduler): D:/Random Projects/BatSimDev/fdse-2024/simulation/schedulers/easy_knn.py
Source (predictor): D:/Random Projects/BatSimDev/fdse-2024/simulation/schedulers/predictor/knn.py
Original BatSim 3.1.0; this port targets BatSim 4.x + portal's tanaxer/pybatsim:latest.

PyBatsim discovery: class `Easy_knn_inline` from filename `Easy_knn_inline.py`.
"""

from batsim.batsim import BatsimScheduler
from sortedcontainers import SortedSet, SortedList, SortedListWithKey
from procset import ProcSet
from copy import deepcopy
import logging
import json
import numpy as np


# ---------------------------------------------------------------------------
# Inlined predictor (predictor/knn.py, unchanged logic) -----------------------
# ---------------------------------------------------------------------------

_NUMBER_NEIGHBORS = 5


def _find_nearest_neighbors(dataset, current_job, number_of_neighbors):
    extra_dataset = np.concatenate((dataset, [current_job]))
    categorical_indices = np.arange(len(current_job))[2:]
    nominal_indices = np.arange(len(current_job))[:2]

    nominal_data = extra_dataset[:, nominal_indices]
    nominal_ranges = np.max(nominal_data).flatten() - np.min(nominal_data).flatten()
    nominal_ranges[nominal_ranges == 0] = 1

    nearest_neighbors = []
    idx = len(dataset) - 1

    for job in reversed(dataset):
        distance = _calculate_distance(
            job, current_job, categorical_indices, nominal_indices, nominal_ranges
        )
        if distance < 100:
            if len(nearest_neighbors) < number_of_neighbors:
                nearest_neighbors.append({"index": idx, "distance": distance})
                nearest_neighbors.sort(key=lambda j: j["distance"])
            elif distance < nearest_neighbors[-1]["distance"]:
                nearest_neighbors.append({"index": idx, "distance": distance})
                nearest_neighbors.sort(key=lambda j: j["distance"])
                del nearest_neighbors[number_of_neighbors]
        idx -= 1
    return nearest_neighbors


def _calculate_distance(finish_job, current_job, categorical_indices,
                        nominal_indices, nominal_ranges):
    categorical_distance = np.count_nonzero(
        finish_job[categorical_indices] != current_job[categorical_indices]
    ) * 100
    nominal_distances = (
        finish_job[nominal_indices] - current_job[nominal_indices]
    ) / nominal_ranges
    return np.sqrt(
        np.sum(np.square(categorical_distance)) + np.sum(np.square(nominal_distances))
    )


def _calculate_weight(distance):
    alpha, beta = 1, 1
    return np.exp(-alpha * (distance ** beta))


def knn_walltime_predictor(finished_jobs, job, data_size=1000, use_user_estimate=False):
    """Predict job runtime from K nearest finished jobs (KNN regression).

    Returns the predicted walltime (seconds). Falls back to job.requested_time
    when fewer than 2 finished jobs are available.
    """
    neighbor_space = finished_jobs[-data_size:]
    if len(neighbor_space) < 2:
        return job.requested_time

    dataset = []
    for finished_job in neighbor_space:
        dataset.append([
            finished_job.requested_resources,
            finished_job.requested_time,
            finished_job.json_dict["exe_num"],
            finished_job.json_dict["uid"],
        ])

    job_info = np.array([
        job.requested_resources,
        job.requested_time,
        job.json_dict["exe_num"],
        job.json_dict["uid"],
    ])
    predict = job.requested_time

    nearest = _find_nearest_neighbors(np.array(dataset), job_info, _NUMBER_NEIGHBORS)
    estimations, runtimes, weights = [], [], []

    if nearest:
        for neighbor in nearest:
            w = _calculate_weight(neighbor["distance"])
            weights.append(w)
            ji = neighbor["index"]
            ni = neighbor_space[ji]
            estimations.append(ni.requested_time / int(ni.profile) * w)
            runtimes.append(int(ni.profile) * w)

        if use_user_estimate:
            calibration = np.sum(estimations) / np.sum(weights)
            predict = max(job.requested_time // calibration, 1)
        else:
            predict = max(np.sum(runtimes) // np.sum(weights), 1)

    return predict


# ---------------------------------------------------------------------------
# Scheduler (easy_knn.py, identical behaviour) --------------------------------
# ---------------------------------------------------------------------------

EXTEND_BACKFILLING = False
USE_BUFFER_BACKFILLING = False


class Easy_knn_inline(BatsimScheduler):
    def __init__(self, options):
        self.options = options
        self.logger = logging.getLogger(__name__)

    def onAfterBatsimInit(self):
        self.total_nodes = self.bs.nb_resources
        self.idleNodes = SortedList(range(self.total_nodes))
        self.listRunningJobs = SortedListWithKey(
            key=lambda job: job.estimate_finish_time
        )
        self.listWaittingJobs = []
        self.finishedJobs = []
        self.waitTimes = [0]
        self.jobStartTimeDict = {}
        self.predictionStatistics = []

    def onJobSubmission(self, job):
        if job.requested_resources > self.bs.nb_compute_resources:
            self.bs.reject_jobs([job])

        predict_walltime = knn_walltime_predictor(self.finishedJobs, job)
        job.user_requested_time = job.requested_time
        job.requested_time = predict_walltime
        job.is_backfilled = False

        current_time = self.bs.time()
        if len(self.idleNodes) < job.requested_resources:
            if len(self.listWaittingJobs) == 0:
                self.findShadowTimeAndExtraNodes(job)
            self.listWaittingJobs.append(job)
        else:
            job.estimate_finish_time = current_time + job.requested_time
            if (
                len(self.listWaittingJobs) == 0
                or job.estimate_finish_time <= self.shadowTime
            ):
                self.executeJob(job, current_time)
            elif (
                len(self.listWaittingJobs) > 0
                and self.shadowTime < job.estimate_finish_time
                and job.requested_resources <= self.extraNodes
            ):
                self.extraNodes -= job.requested_resources
                self.executeJob(job, current_time)
            else:
                self.listWaittingJobs.append(job)

    def onJobCompletion(self, job):
        self.listRunningJobs.remove(job)
        current_time = self.bs.time()
        job.finish_time = current_time
        self.freeComputeNodes(job)
        if len(self.listWaittingJobs) > 0:
            self.executeSomeJobs(current_time)

        job_id = int(job.id.split("!")[1])
        self.finishedJobs.append(job)
        self.predictionStatistics.append([
            job_id,
            job.submit_time,
            job.requested_resources,
            job.json_dict["uid"],
            job.user_requested_time,
            job.finish_time - self.jobStartTimeDict[job_id],
            job.requested_time,
            job.is_backfilled,
        ])

    def findShadowTimeAndExtraNodes(self, job):
        nbFreeNodes = len(self.idleNodes)
        for j in self.listRunningJobs:
            nbFreeNodes += j.requested_resources
            if job.requested_resources <= nbFreeNodes:
                self.extraNodes = nbFreeNodes - job.requested_resources
                if EXTEND_BACKFILLING:
                    if USE_BUFFER_BACKFILLING:
                        self.shadowTime = j.estimate_finish_time
                    else:
                        self.shadowTime = j.estimate_finish_time + int(
                            np.average(self.waitTimes)
                        )
                else:
                    self.shadowTime = j.estimate_finish_time
                break

    def executeSomeJobs(self, current_time):
        if self.listWaittingJobs[0].requested_resources <= len(self.idleNodes):
            self.executeHeadOfList(self.listWaittingJobs, current_time)
            first_queued_job_alloc = False
        else:
            first_queued_job_alloc = True

        if first_queued_job_alloc == False and len(self.listWaittingJobs) > 0:
            self.findShadowTimeAndExtraNodes(self.listWaittingJobs[0])

        if len(self.listWaittingJobs) > 1:
            self.backFillJobs(self.listWaittingJobs, current_time)

    def executeHeadOfList(self, L, current_time):
        while len(L) > 0 and L[0].requested_resources <= len(self.idleNodes):
            job = L.pop(0)
            job.estimate_finish_time = current_time + job.requested_time
            self.executeJob(job, current_time)

    def backFillJobs(self, L, current_time):
        i = 1
        for j in range(len(L) - 1):
            if len(self.idleNodes) == 0:
                break
            job = L[i]
            if (
                job.requested_resources <= len(self.idleNodes)
                and current_time + job.requested_time <= self.shadowTime
            ):
                job.estimate_finish_time = current_time + job.requested_time
                del L[i]
                job.is_backfilled = True
                self.executeJob(job, current_time)
            elif (
                self.shadowTime < current_time + job.requested_time
                and job.requested_resources <= min(self.extraNodes, len(self.idleNodes))
            ):
                self.extraNodes -= job.requested_resources
                job.estimate_finish_time = current_time + job.requested_time
                del L[i]
                job.is_backfilled = True
                self.executeJob(job, current_time)
            else:
                i += 1

    def freeComputeNodes(self, job):
        self.idleNodes += job.nodes
        del job.nodes[:]

    def executeJob(self, job, current_time):
        allocated_nodes = self.idleNodes[0 : job.requested_resources]
        job.nodes = allocated_nodes
        del self.idleNodes[0 : job.requested_resources]

        resources_allocation = ProcSet(*allocated_nodes)
        job.allocation = resources_allocation

        self.listRunningJobs.add(job)

        job_to_execute = deepcopy(job)
        job_to_execute.request_time = job_to_execute.user_requested_time

        job_id = int(job_to_execute.id.split("!")[1])
        self.jobStartTimeDict[job_id] = current_time

        self.waitTimes.append(current_time - job.submit_time)

        self.bs.execute_jobs([job_to_execute])

    def onSimulationEnds(self):
        outputStatisticFileName = "prediction-statistic.json"
        try:
            with open(outputStatisticFileName, "w") as f:
                json.dump(self.predictionStatistics, f, indent=2)
            print("Generated prediction statistic to {}".format(outputStatisticFileName))
        except IOError as ex:
            print(ex)
