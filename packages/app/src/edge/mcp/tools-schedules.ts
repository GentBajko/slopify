import { formBody, type RouteTool } from "./route-tool.js";

export const scheduleTools: readonly RouteTool[] = [
  {
    name: "list_schedules",
    route: "GET /api/schedules",
    title: "List schedules",
    description: "Schedules with their next runs, release lines and topic queues.",
  },
  {
    name: "create_schedule",
    route: "POST /api/schedules",
    title: "Create a schedule",
    description: `${formBody("the schedule editor")} Duplicate on a schedule is this with get_schedule's settings, a new id, a new name ending "(copy)" and items: [], then pause_schedule on the copy.`,
  },
  {
    name: "get_schedule",
    route: "GET /api/schedules/:id",
    title: "Read a schedule",
    description: "One schedule with its topic queue and release lines.",
  },
  {
    name: "update_schedule",
    route: "PUT /api/schedules/:id",
    title: "Save a schedule",
    description: `${formBody("the schedule editor")} Its release lines set when each run's videos are released.`,
  },
  {
    name: "pause_schedule",
    route: "POST /api/schedules/:id/pause",
    title: "Pause a schedule",
    description: "No run starts from it until resume_schedule.",
  },
  {
    name: "resume_schedule",
    route: "POST /api/schedules/:id/resume",
    title: "Resume a schedule",
    description: "Runs start from it again at its times.",
  },
  {
    name: "cancel_schedule",
    route: "POST /api/schedules/:id/cancel",
    title: "Cancel a schedule",
    description: "Cancel schedule, as the schedule's page does.",
    confirm: "Stops future scheduled runs. Existing projects and run history are kept.",
  },
  {
    name: "delete_schedule",
    route: "DELETE /api/schedules/:id",
    title: "Delete a schedule",
    description: "Moves the schedule to the trash.",
    confirm:
      "Moves this schedule to the trash for 30 days (Settings → Trash). Its run history is kept.",
  },
  {
    name: "list_held_topics",
    route: "GET /api/schedules/:id/topics/held",
    title: "Read suggested topics",
    description:
      "Topics the schedule generated and holds for approval, as Calendar → Suggested topics lists them.",
  },
  {
    name: "list_prepared_topics",
    route: "GET /api/schedules/:id/prepared",
    title: "Read prepared topics",
    description: "Which queued topics are Prepared ahead, and their projects.",
  },
  {
    name: "prepare_topic",
    route: "POST /api/schedules/:id/topics/prepare",
    title: "Prepare a topic",
    description:
      "Prepare, from the schedule's topics or Open on calendar: makes the topic's project now, exactly as the schedule would, and runs everything but the video, which its scheduled day renders. It spends what Play's review estimates and is refused over the schedule's spend limit. Body: {topic: the topic's title}.",
  },
  {
    name: "generate_topics",
    route: "POST /api/schedules/:id/topics/generate",
    title: "Suggest topics",
    description: "Asks the schedule's text model for topics, a paid call, like Suggest topics.",
  },
  {
    name: "approve_all_topics",
    route: "POST /api/schedules/:id/topics/held/approve-all",
    title: "Approve every suggested topic",
    description: "Moves every held topic into the queue.",
  },
  {
    name: "approve_topics",
    route: "POST /api/schedules/:id/topics/held/approve",
    title: "Approve selected topics",
    description:
      "Approve selected: moves these held topics into the queue. Body: {ids: [held topic ids]}.",
  },
  {
    name: "reject_topics",
    route: "POST /api/schedules/:id/topics/held/reject",
    title: "Reject selected topics",
    description:
      "Reject selected, or Reject all with every id shown: later generations won't suggest them again. Body: {ids: [held topic ids]}.",
  },
  {
    name: "restore_topics",
    route: "POST /api/schedules/:id/topics/held/restore",
    title: "Bring rejected topics back",
    description: `The Undo after a rejection: puts turned-down topics back. ${formBody("the Undo in the rejection's message")}`,
  },
  {
    name: "approve_topic",
    route: "POST /api/schedules/:id/topics/held/:topicId/approve",
    title: "Approve a topic",
    description: formBody("Approve in Calendar → Suggested topics"),
  },
  {
    name: "reject_topic",
    route: "POST /api/schedules/:id/topics/held/:topicId/reject",
    title: "Reject a topic",
    description: "Turns down one suggested topic.",
  },
  {
    name: "edit_held_topic",
    route: "PUT /api/schedules/:id/topics/held/:topicId",
    title: "Edit a suggested topic",
    description: formBody("the suggested topic's editor"),
  },
  {
    name: "set_topic_queue",
    route: "PUT /api/schedules/:id/topics",
    title: "Set the topic queue",
    description: `${formBody("the schedule's topic queue")} Bulk paste is this with the pasted topics added to the queue.`,
  },
  {
    name: "move_topic",
    route: "POST /api/schedules/:id/topics/move",
    title: "Move a topic",
    description: `Reorders the queue. ${formBody("the topic queue's move")}`,
  },
  {
    name: "transfer_topic",
    route: "POST /api/schedules/:id/topics/transfer",
    title: "Move a topic to another schedule",
    description: formBody("the topic queue's move to another schedule"),
  },
  {
    name: "get_calendar",
    route: "GET /api/calendar",
    title: "Read the calendar",
    description:
      "Upcoming scheduled runs (each with its prepared project, if any) and projects, each with needs (failed, paused, stopped, review) and readyToUpload. Query: {from, to: ISO times at most 92 days apart}.",
  },
];
