/** Constants for Project Adam Pre-check Performance & KPI Module. */
var KPI_CONST = Object.freeze({
  VERSION: '1.1.2',
  SHEETS: Object.freeze({
    EVENTS: 'PC_KPIEvents',
    ASSIGNMENTS: 'PC_KPIAssignments',
    DAILY: 'PC_KPIDaily',
    QUEUE_SNAPSHOTS: 'PC_KPIQueueSnapshots',
    CONFIG: 'PC_KPIConfig',
    HOLIDAYS: 'PC_KPIHolidays',
    JOB_RUNS: 'PC_KPIJobRuns'
  }),
  ASSIGNMENT_MODE: Object.freeze({ OFF: 'OFF', MANUAL: 'MANUAL', ROUND_ROBIN: 'ROUND_ROBIN' }),
  ASSIGNMENT_STATUS: Object.freeze({
    AVAILABLE: 'AVAILABLE', ASSIGNED: 'ASSIGNED', CLAIMED: 'CLAIMED', IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED', COMPLETED_OTHER: 'COMPLETED_OTHER', REASSIGNED: 'REASSIGNED', CANCELLED: 'CANCELLED'
  }),
  EVENT: Object.freeze({
    VERSION_UPLOADED: 'VERSION_UPLOADED',
    REVIEW_STARTED: 'REVIEW_STARTED',
    REVIEW_COMPLETED: 'REVIEW_COMPLETED',
    KPI_DASHBOARD_VIEW: 'KPI_DASHBOARD_VIEW',
    KPI_OFFICER_DETAIL_VIEW: 'KPI_OFFICER_DETAIL_VIEW',
    KPI_CONFIG_CHANGE: 'KPI_CONFIG_CHANGE',
    KPI_EXPORT: 'KPI_EXPORT',
    QUEUE_OPEN: 'QUEUE_OPEN',
    REVIEW_OPEN: 'REVIEW_OPEN',
    ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
    ASSIGNMENT_CLAIMED: 'ASSIGNMENT_CLAIMED',
    ASSIGNMENT_REASSIGNED: 'ASSIGNMENT_REASSIGNED',
    ADMIN_OVERRIDE: 'ADMIN_OVERRIDE'
  }),
  CONFIG: Object.freeze({
    ENABLED: 'KPI_ENABLED',
    BASELINE_MODE: 'KPI_BASELINE_MODE',
    SCORE_ENABLED: 'KPI_SCORE_ENABLED',
    ASSIGNMENT_MODE: 'KPI_ASSIGNMENT_MODE',
    WORKDAY_START: 'KPI_WORKDAY_START',
    WORKDAY_END: 'KPI_WORKDAY_END',
    WORKING_DAYS: 'KPI_WORKING_DAYS',
    SESSION_IDLE_MINUTES: 'KPI_SESSION_IDLE_MINUTES',
    RESPONSE_SLA_MINUTES: 'KPI_RESPONSE_SLA_MINUTES',
    TURNAROUND_SLA_MINUTES: 'KPI_TURNAROUND_SLA_MINUTES',
    MIN_SAMPLE_SIZE: 'KPI_MIN_SAMPLE_SIZE',
    CACHE_SECONDS: 'KPI_CACHE_SECONDS',
    SNAPSHOT_MINUTES: 'KPI_QUEUE_SNAPSHOT_MINUTES',
    SNAPSHOT_RETENTION_DAYS: 'KPI_QUEUE_SNAPSHOT_RETENTION_DAYS',
    EVENT_RETENTION_DAYS: 'KPI_EVENT_RETENTION_DAYS',
    WEIGHT_RESPONSIVENESS: 'KPI_WEIGHT_RESPONSIVENESS',
    WEIGHT_WORKLOAD: 'KPI_WEIGHT_WORKLOAD',
    WEIGHT_PROCESSING: 'KPI_WEIGHT_PROCESSING',
    WEIGHT_QUALITY: 'KPI_WEIGHT_QUALITY',
    WEIGHT_ENGAGEMENT: 'KPI_WEIGHT_ENGAGEMENT',
    CONFIG_VERSION: 'KPI_CONFIG_VERSION'
  }),
  CACHE_PREFIX: 'PC_KPI_',
  TIMEZONE: 'Asia/Bangkok'
});

var KPI_HEADERS = Object.freeze({
  PC_KPIEvents: ['EventId','EventKey','Timestamp','OfficerEmail','OfficerName','EventType','SubmissionId','VersionId','ReviewId','SessionId','Source','MetadataJSON','CreatedAt'],
  PC_KPIAssignments: ['AssignmentId','AssignmentKey','SubmissionId','VersionId','OfficerEmail','OfficerName','AssignmentType','AssignedAt','AssignedBy','ClaimedAt','FirstOpenedAt','CompletedAt','CompletedByEmail','CompletedByName','Status','ReassignedFrom','ReassignedTo','Reason','CreatedAt','UpdatedAt'],
  PC_KPIDaily: ['DailyKey','Date','OfficerEmail','OfficerName','CompletedReviews','UniqueSubmissions','FirstReviews','RevisionReviews','ApprovedReviews','RevisionRequiredReviews','MedianResponseMinutes','P90ResponseMinutes','MedianResponseElapsedMinutes','MedianTurnaroundMinutes','P90TurnaroundMinutes','MedianTurnaroundElapsedMinutes','MedianReviewElapsedMinutes','ObservedActiveMinutes','ProductiveSessions','ActiveDay','SlaEligible','SlaResponsePassed','SlaTurnaroundPassed','ChecklistCompletionRate','AdminOverrides','ReopenedReviews','QueueChecks','UpdatedAt'],
  PC_KPIQueueSnapshots: ['SnapshotId','Timestamp','WaitingCount','InReviewCount','RevisionWaitingCount','Under2Hours','Hours2to4','Hours4to8','Over8Hours','OldestWaitingMinutes','OverResponseSlaCount','CreatedAt'],
  PC_KPIConfig: ['Key','Value','Description','UpdatedAt','UpdatedBy'],
  PC_KPIHolidays: ['Date','IsWorkingDay','StartTime','EndTime','Description','UpdatedAt','UpdatedBy'],
  PC_KPIJobRuns: ['JobRunId','JobType','TriggerType','StartedAt','CompletedAt','Status','Stage','ProcessedCount','AddedCount','UpdatedCount','PrunedCount','Message','ErrorCode','ErrorMessage','RunnerEmail','ModuleVersion']
});

var KPI_DEFAULT_CONFIG = Object.freeze([
  ['KPI_ENABLED','TRUE','เปิด/ปิดโมดูล KPI โดยไม่กระทบ workflow หลัก'],
  ['KPI_BASELINE_MODE','TRUE','โหมดเก็บ baseline: แสดงข้อมูลจริงแต่ยังไม่ใช้คะแนนจัดอันดับ'],
  ['KPI_SCORE_ENABLED','FALSE','แสดง Composite KPI Score เมื่อมีข้อมูลเพียงพอและ Admin อนุมัติเกณฑ์แล้ว'],
  ['KPI_ASSIGNMENT_MODE','OFF','OFF / MANUAL / ROUND_ROBIN; ค่าเริ่มต้นไม่เปลี่ยน workflow การรับงานเดิม'],
  ['KPI_WORKDAY_START','08:00','เวลาเริ่มวันทำการสำหรับ Business Time — Admin ต้องตรวจรับก่อนใช้เป็นเกณฑ์ทางการ'],
  ['KPI_WORKDAY_END','16:30','เวลาสิ้นสุดวันทำการสำหรับ Business Time — Admin ต้องตรวจรับก่อนใช้เป็นเกณฑ์ทางการ'],
  ['KPI_WORKING_DAYS','1,2,3,4,5','วันทำการ 1=จันทร์ ... 7=อาทิตย์'],
  ['KPI_SESSION_IDLE_MINUTES','10','ถ้ากิจกรรมห่างกันเกินค่านี้ให้ถือเป็นคนละ productive session'],
  ['KPI_RESPONSE_SLA_MINUTES','240','เป้าหมายเริ่มตรวจภายใน Business Minutes; ใช้เชิงข้อมูลระหว่าง Baseline Mode'],
  ['KPI_TURNAROUND_SLA_MINUTES','480','เป้าหมายให้ผลตรวจภายใน Business Minutes; ใช้เชิงข้อมูลระหว่าง Baseline Mode'],
  ['KPI_MIN_SAMPLE_SIZE','10','จำนวน Completed Reviews ขั้นต่ำก่อนแสดง Composite Score'],
  ['KPI_CACHE_SECONDS','120','อายุ cache ของ dashboard'],
  ['KPI_QUEUE_SNAPSHOT_MINUTES','30','รอบบันทึก Queue Snapshot; รองรับ 1,5,10,15,30 นาที'],
  ['KPI_QUEUE_SNAPSHOT_RETENTION_DAYS','365','เก็บ Queue Snapshot ย้อนหลัง'],
  ['KPI_EVENT_RETENTION_DAYS','730','อายุ Event Analytics ที่สามารถ cleanup ได้'],
  ['KPI_WEIGHT_RESPONSIVENESS','30','น้ำหนัก Responsiveness เมื่อเปิด Composite Score'],
  ['KPI_WEIGHT_WORKLOAD','25','น้ำหนัก Workload เมื่อเปิด Composite Score'],
  ['KPI_WEIGHT_PROCESSING','15','น้ำหนัก Processing เมื่อเปิด Composite Score'],
  ['KPI_WEIGHT_QUALITY','20','น้ำหนัก Quality เมื่อเปิด Composite Score'],
  ['KPI_WEIGHT_ENGAGEMENT','10','น้ำหนัก Engagement เมื่อเปิด Composite Score'],
  ['KPI_CONFIG_VERSION','1','Schema/config version']
]);
