import { Alert } from "react-native";
import * as Device from "expo-device";

const REMINDER_OFFSETS = {
  at_start: 0,
  before_5: 5,
  before_10: 10,
  before_30: 30,
  before_60: 60
};

const pad = (value) => String(value).padStart(2, "0");

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
  if (!task || task.isCompleted || task.done || task.reminderType === "none") return null;

  if (task.reminderType === "custom") {
    return dateFromKeyAndTime(task.reminderDate || task.date, task.reminderTime);
  }

  if (!(task.reminderType in REMINDER_OFFSETS) || task.isAllDay || !task.startTime) return null;
  const startDate = dateFromKeyAndTime(task.startDate || task.date, task.startTime);
  if (!startDate) return null;
  return addMinutes(startDate, -REMINDER_OFFSETS[task.reminderType]);
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
      Alert.alert("\uc54c\ub9bc \uc548\ub0b4", "\uc2e4\uc81c \uae30\uae30\uc5d0\uc11c\ub9cc \uc54c\ub9bc\uc744 \ubc1b\uc744 \uc218 \uc788\uc5b4\uc694.");
    }
    return false;
  }

  if (showAlert) {
    Alert.alert(
      "\uc54c\ub9bc \uc900\ube44 \uc911",
      "Expo Go\uc5d0\uc11c \uc54c\ub9bc \ubaa8\ub4c8\uc744 \ubd88\ub7ec\uc624\ub294 \uc911 \uc624\ub958\uac00 \uc788\uc5b4 \uc9c0\uae08\uc740 \uc54c\ub9bc \uac12\ub9cc \uc800\uc7a5\ud574\uc694. \uc571\uc774 \uaebc\uc9c0\uc9c0 \uc54a\ub3c4\ub85d \uc784\uc2dc\ub85c \uc608\uc57d\uc740 \uaebc\ub450\uc5c8\uc5b4\uc694."
    );
  }
  return false;
}

export async function cancelTaskNotification() {
  return;
}

export async function cancelAllTaskNotifications() {
  return;
}

export async function scheduleTaskNotification(
  task,
  { showPermissionAlert = true, showPastAlert = true } = {}
) {
  const triggerDate = getTaskNotificationDate(task);
  if (!triggerDate) return { task: { ...task, notificationId: null }, status: "none" };

  if (triggerDate.getTime() <= Date.now()) {
    if (showPastAlert) {
      Alert.alert("\uc54c\ub9bc \uc2dc\uac04", "\uc774\ubbf8 \uc9c0\ub09c \uc2dc\uac04\uc774\ub77c \uc54c\ub9bc\uc744 \uc124\uc815\ud560 \uc218 \uc5c6\uc5b4\uc694.");
    }
    return { task: { ...task, notificationId: null }, status: "past" };
  }

  await requestNotificationPermission({ showAlert: showPermissionAlert });
  return { task: { ...task, notificationId: null }, status: "unsupported", triggerDate };
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
  return tasks.map((task) => ({ ...task, notificationId: null }));
}
