# Examples

Five things buttonmasher does to your code, with the code that broke, the
report it wrote, and the fix it applied or proposed.

| Example | Move | Verdict | Fix size |
|---|---|---|---|
| [Double submit](double-submit.md) | Click it twice | BROKE | 3 lines applied, index proposed |
| [Retry after timeout](retry-after-timeout.md) | Retry it | BROKE | 2 hunks, proposed (API contract) |
| [Webhook replay](webhook-replay.md) | Repeat it | BROKE | 4 lines + table, proposed |
| [Out of order](out-of-order.md) | Reorder it | BROKE | 3 lines, applied |
| [Boring](boring.md) | All of them | BORING | none |

All five are hand-written. For a real run with real output, see [demo/](../demo/). The stacks vary on
purpose: the bugs don't care what framework you use.
