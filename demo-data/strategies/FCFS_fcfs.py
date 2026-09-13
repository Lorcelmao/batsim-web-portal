"""Strict FCFS scheduler (no backfill) for PyBatsim.

PyBatsim CLI discovery: filename 'fcfs.py' -> class 'Fcfs'.
Uses correct batsim API: from batsim.batsim import BatsimScheduler.
"""

from batsim.batsim import BatsimScheduler
from procset import ProcSet


class Fcfs(BatsimScheduler):
    def __init__(self, options):
        super().__init__(options)
        self.queue = []
        self.available = None

    def onSimulationBegins(self):
        self.available = ProcSet(*range(self.bs.nb_resources))

    def onJobSubmission(self, job):
        self.queue.append(job)
        self._schedule()

    def onJobCompletion(self, job):
        if job.allocation is not None:
            self.available = self.available | job.allocation
        self._schedule()

    def _schedule(self):
        while self.queue:
            job = self.queue[0]
            needed = job.requested_resources
            if needed > len(self.available):
                break
            allocated = ProcSet()
            count = 0
            for r in self.available:
                allocated = allocated | ProcSet(r)
                count += 1
                if count >= needed:
                    break
            self.available = self.available - allocated
            job.allocation = allocated
            self.bs.execute_job(job)
            self.queue.pop(0)
