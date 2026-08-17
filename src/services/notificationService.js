import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

const CHANNEL_ID = "doodoo-tasks";

const REMINDER_OFFSETS = {
  at_start: 0,
  before_5: 5,
  before_10: 10,
  before_30: 30,
  before_60: 60
};

const REMINDER_LABELS = {
  at_start: "\uc2dc\uc791 \uc2dc\uac04",
  before_5: "5\ubd84 \uc804",
  before_10: "10\ubd84 \uc804",
  before_30: "30\ubd84 \uc804",
  before_60: "1\uc2dc\uac04 \uc804",
  custom: "\uc9c1\uc811 \uc124\uc815"
};

const pad = (value) => String(value).padStart(2, "0");

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
} catch (error) {
  console.warn("[DooDoo] Notification handler setup failed:", error?.message || error);
}

function dateFromKeyAndTime(dateKey, timeKey) {
  if (!dateKey || !timeKey) return null;

  const [year, month, day] = String(dateKey).split("-").map(Number);
  const [hour, minute] = String(timeKey).split(":").map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function ensureAndroidChannel() {
  if (Device.osName !== "Android") return;

  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "DooDoo",
      importance: Notifications.AndroidImportance?.HIGH ?? 4,
      sound: "default",
      vibrationPattern: [0, 220, 120, 220],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC
    });
  } catch (error) {
    console.warn("[DooDoo] Android notification channel setup failed:", error?.message || error);
  }
}

export function getReminderBody(task) {
  if (task.reminderType === "at_start") return "\uc9c0\uae08 \uc2dc\uc791\ud560 \uc2dc\uac04\uc774\uc5d0\uc694.";
  if (task.reminderType === "before_5") return "5\ubd84 \ub4a4 \uc2dc\uc791\ud560 \ud560 \uc77c\uc774 \uc788\uc5b4\uc694.";
  if (task.reminderType === "before_10") return "10\ubd84 \ub4a4 \uc2dc\uc791\ud560 \ud560 \uc77c\uc774 \uc788\uc5b4\uc694.";
  if (task.reminderType === "before_30") return "30\ubd84 \ub4a4 \uc2dc\uc791\ud560 \ud560 \uc77c\uc774 \uc788\uc5b4\uc694.";
  if (task.reminderType === "before_60") return "1\uc2dc\uac04 \ub4a4 \uc2dc\uc791\ud560 \ud560 \uc77c\uc774 \uc788\uc5b4\uc694.";
  if (task.reminderType === "custom") return "\uc124\uc815\ud55c \ud560 \uc77c \uc54c\ub9bc\uc774\uc5d0\uc694.";
  return "\ud560 \uc77c\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.";
}

export function getTaskNotificationDate(task) {
  const reminderType = task?.reminderType || "none";
  if (!task || task.isCompleted || task.done || reminderType === "none") return null;

  if (reminderType === "custom") {
    return dateFromKeyAndTime(task.reminderDate || task.date, task.reminderTime);
  }

  if (!(reminderType in REMINDER_OFFSETS) || task.isAllDay || !task.startTime) return null;

  const startDate = dateFromKeyAndTime(task.startDate || task.date, task.startTime);
  if (!startDate) return null;

  return addMinutes(startDate, -REMINDER_OFFSETS[reminderType]);
}

export function formatNotificationDate(date) {
  if (!date) return "";

  const period = date.getHours() >= 12 ? "\uc624\ud6c4" : "\uc624\uc804";
  const hour12 = date.getHours() % 12 || 12;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${period} ${hour12}:${pad(date.getMinutes())}`;
}

export async function requestNotificationPermission({ showAlert = true } = {}) {
  if (!Device.isDevice) {
    if (showAlert) {
      console.warn("[DooDoo] Notifications require a physical device.");
    }
    return false;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;

    if (current.status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true
        }
      });
      finalStatus = requested.status;
    }

    const granted = finalStatus === "granted";
    if (!granted && showAlert) {
      console.warn("[DooDoo] Notification permission was not granted.");
    }

    if (granted) await ensureAndroidChannel();
    return granted;
  } catch (error) {
    console.warn("[DooDoo] Notification permission failed:", error?.message || error);
    return false;
  }
}

export async function cancelTaskNotification(notificationId) {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn("[DooDoo] Cancel notification failed:", error?.message || error);
  }
}

export async function cancelAllTaskNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn("[DooDoo] Cancel all notifications failed:", error?.message || error);
  }
}

function getNotificationContent(task) {
  return {
    title: task.title || "DooDoo",
    body: getReminderBody(task),
    sound: "default",
    data: {
      taskId: task.id,
      reminderType: task.reminderType || "none",
      reminderLabel: REMINDER_LABELS[task.reminderType] || ""
    }
  };
}

function getDateTrigger(date) {
  if (Notifications.SchedulableTriggerInputTypes?.DATE) {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CHANNEL_ID
    };
  }

  return date;
}

export async function scheduleTaskNotification(
  task,
  { showPermissionAlert = true, showPastAlert = true } = {}
) {
  const triggerDate = getTaskNotificationDate(task);
  if (!triggerDate) return { task: { ...task, notificationId: null }, status: "none" };

  if (triggerDate.getTime() <= Date.now()) {
    if (showPastAlert) {
      console.warn("[DooDoo] Notification time is already in the past.");
    }
    return { task: { ...task, notificationId: null }, status: "past", triggerDate };
  }

  const hasPermission = await requestNotificationPermission({ showAlert: showPermissionAlert });
  if (!hasPermission) {
    return { task: { ...task, notificationId: null }, status: "permission-denied", triggerDate };
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: getNotificationContent(task),
      trigger: getDateTrigger(triggerDate)
    });

    return {
      task: { ...task, notificationId },
      status: "scheduled",
      notificationId,
      triggerDate
    };
  } catch (error) {
    console.warn("[DooDoo] Schedule notification failed:", error?.message || error);
    return { task: { ...task, notificationId: null }, status: "failed", error, triggerDate };
  }
}

export async function prepareTaskNotification(nextTask, previousTask = null, options = {}) {
  if (previousTask?.notificationId) {
    await cancelTaskNotification(previousTask.notificationId);
  }

  if (nextTask.isCompleted || nextTask.done || nextTask.reminderType === "none") {
    return { ...nextTask, notificationId: null };
  }

  const result = await scheduleTaskNotification(nextTask, options);
  return result.task;
}

export async function resyncTaskNotifications(tasks = []) {
  const nextTasks = [];

  for (const task of tasks) {
    if (task.notificationId) {
      await cancelTaskNotification(task.notificationId);
    }

    if (task.isCompleted || task.done || task.reminderType === "none") {
      nextTasks.push({ ...task, notificationId: null });
      continue;
    }

    const result = await scheduleTaskNotification(task, {
      showPermissionAlert: false,
      showPastAlert: false
    });
    nextTasks.push(result.task);
  }

  return nextTasks;
}
