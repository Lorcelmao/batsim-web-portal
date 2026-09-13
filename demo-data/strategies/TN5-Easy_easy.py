"""EASY Backfill scheduler for PyBatsim.

PyBatsim CLI discovery: filename 'easy.py' -> class 'Easy'.
Algorithm: FCFS with conservative backfill — small jobs can run ahead of the
head-of-queue if they don't delay it. Uses requested_time (walltime) for
shadow time calculation; if not available, uses job.requested_time.
"""

from batsim.batsim import BatsimScheduler
from procset import ProcSet


class Easy(BatsimScheduler):
    def __init__(self, options):
        super().__init__(options)
        self.queue = []
        self.available = None
        self.running = []  # list of (job, finish_time)

    def onSimulationBegins(self):
        self.available = ProcSet(*range(self.bs.nb_resources))

    def onJobSubmission(self, job):
        self.queue.append(job)
        self._schedule()

    def onJobCompletion(self, job):
        if job.allocation is not None:
            self.available = self.available | job.allocation
        self.running = [(j, t) for (j, t) in self.running if j.id != job.id]
        self._schedule()

    def _allocate(self, needed):
        allocated = ProcSet()
        count = 0
        for r in self.available:
            allocated = allocated | ProcSet(r)
            count += 1
            if count >= needed:
                break
        return allocated

    def _schedule(self):
        now = self.bs.time()
        # 1) Run head-of-queue if it fits
        while self.queue:
            head = self.queue[0]
            if head.requested_resources <= len(self.available):
                alloc = self._allocate(head.requested_resources)
                self.available = self.available - alloc
                head.allocation = alloc
                self.bs.execute_job(head)
                wt = getattr(head, "requested_time", None) or 60.0
                self.running.append((head, now + wt))
                self.queue.pop(0)
            else:
                break

        # 2) Backfill: head blocked → estimate shadow time, fill smaller jobs
        if not self.queue:
            return
        head = self.queue[0]
        if head.requested_resources <= len(self.available):
            return  # head fits, no need to backfill

        # Shadow time: when enough resources free for head
        sorted_running = sorted(self.running, key=lambda x: x[1])
        freed = len(self.available)
        shadow_time = now
        for j, ft in sorted_running:
            freed += len(j.allocation) if j.allocation else 0
            if freed >= head.requested_resources:
                shadow_time = ft
                break

        # Backfill any job that finishes before shadow_time
        i = 1
        while i < len(self.queue):
            cand = self.queue[i]
            wt = getattr(cand, "requested_time", None) or 60.0
            if cand.requested_resources <= len(self.available) and (now + wt) <= shadow_time:
                alloc = self._allocate(cand.requested_resources)
                self.available = self.available - alloc
                cand.allocation = alloc
                self.bs.execute_job(cand)
                self.running.append((cand, now + wt))
                self.queue.pop(i)
            else:
                i += 1
