"""
Biased FCFS - a deliberately imperfect scheduler for chart demos.

Intentional weakness (this is the point, not a bug): STRICT FCFS with no
backfill - only the queue HEAD may start. When a wide job blocks the head,
everything behind it waits even though smaller jobs would fit, so:
  - the stacked-area chart grows tall yellow "waiting" mountains,
  - the waiting-time CDF drags far right of Filler's,
  - the heatmap shows large idle (dark) patches while the queue is full.

Compare against filler.py on the same frozen workload to make every
comparison chart (delta table, CDF overlay, per-job scatter) light up.

Uses the same PyBatsim 3.x API as the proven TN 5 strategies:
ProcSet bookkeeping + bs.execute_job (there is NO bs.resources_free here).
"""

from batsim.batsim import BatsimScheduler
from procset import ProcSet


class Biased_fcfs(BatsimScheduler):
    """Strict head-of-queue FCFS (no skipping, no backfill)."""

    def __init__(self, options):
        super().__init__(options)
        self.queue = []
        self.available = None

    def onSimulationBegins(self):
        self.available = ProcSet(*range(self.bs.nb_resources))

    def onJobSubmission(self, job):
        self.queue.append(job)
        self._schedule_head()

    def onJobCompletion(self, job):
        if job.allocation is not None:
            self.available = self.available | job.allocation
        self._schedule_head()

    def _schedule_head(self):
        """Start jobs ONLY from the head of the queue."""
        while self.queue:
            head = self.queue[0]
            if head.requested_resources > len(self.available):
                return  # head blocks everyone behind it - the FCFS flaw on display
            allocated = ProcSet()
            count = 0
            for r in self.available:  # ProcSet iterates ascending (low ids first)
                allocated = allocated | ProcSet(r)
                count += 1
                if count >= head.requested_resources:
                    break
            self.available = self.available - allocated
            head.allocation = allocated
            self.queue.pop(0)
            self.bs.execute_job(head)
