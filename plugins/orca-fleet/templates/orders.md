# Orders from the orchestrator

Newest entry first. Every session reads this at start and after every "orders updated" message.
Each entry: date and time, who wrote it, what changed, what every session must do now.

## <date>, <time> (<orchestrator name>): <headline>
<what changed and what each session does now>
<when a lane gets a different job, its new label: "Lane 38 is now `invoice export`"; it takes the label at its next handover>
