"""Filler scheduler — schedule any job that fits in available resources.

PyBatsim CLI discovery: filename 'filler.py' -> class 'Filler'.
Algorithm: scan entire queue, run any job that fits (no head-of-queue
priority — equivalent to aggressive backfill / packing).
"""

from batsim.batsim import BatsimScheduler
from procset import ProcSet


class Filler(BatsimScheduler):
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
        remaining = []
        for job in self.queue:
            needed = job.requested_resources
            if needed <= len(self.available):
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
            else:
                remaining.append(job)
        self.queue = remaining
