import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { loadStoredJson, removeStoredItem, saveStoredJson } from "./src/storage/localStore";
import {
  createCategory,
  createTask,
  deleteCategoryById,
  deleteTaskById,
  loadCategories,
  loadTasks,
  saveCategories,
  saveTasks,
  updateCategory,
  updateCategoryOrder,
  updateTask
} from "./src/repositories/taskRepository";
import {
  getAuthErrorMessage,
  getCurrentAuthSession,
  isEmail,
  signInWithGoogle,
  signInWithEmail,
  signOutFromSupabase,
  signUpWithEmail,
  subscribeAuthStateChange
} from "./src/services/authService";
import {
  cancelAllTaskNotifications,
  cancelTaskNotification,
  prepareTaskNotification,
  resyncTaskNotifications
} from "./src/services/notificationService";

const BLUE = "#4f6ff0";
const BG = "#f4f7fc";
const INK = "#07122f";
const MUTED = "#8b97b4";
const LINE = "#e2e7f0";

const runHaptic = async (callback) => {
  try {
    await callback();
  } catch (error) {
    console.warn("Haptic feedback is not available:", error?.message || error);
  }
};

const playSelectionHaptic = () => runHaptic(() => Haptics.selectionAsync());
const playLightHaptic = () => runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
const playMediumHaptic = () => runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

const priorityCopy = {
  1: "오늘 반드시 해야 해요",
  2: "오늘 하면 좋아요",
  3: "여유가 되면 해요"
};

const priorityColors = {
  1: "#3F5FE8",
  2: "#6380F2",
  3: "#9DB1FF"
};

const reminderOptions = [
  { type: "none", label: "알림 없음", needsStartTime: false },
  { type: "at_start", label: "시작 시간", needsStartTime: true },
  { type: "before_5", label: "5분 전", needsStartTime: true },
  { type: "before_10", label: "10분 전", needsStartTime: true },
  { type: "before_30", label: "30분 전", needsStartTime: true },
  { type: "before_60", label: "1시간 전", needsStartTime: true },
  { type: "custom", label: "직접 설정", needsStartTime: false }
];

const defaultFields = [
  { id: "study", name: "공부", color: "#4f6ff0" },
  { id: "exercise", name: "운동", color: "#31c866" },
  { id: "work", name: "일", color: "#ff9f1c" },
  { id: "home", name: "집안일", color: "#b04ce5" },
  { id: "schedule", name: "일정", color: "#16b8c9" }
];

const fieldColors = ["#4f6ff0", "#31c866", "#ff9f1c", "#a64de4", "#ff666b", "#15b8c8", "#e91e63", "#ff5722", "#009688", "#8d6e63"];
const weekKo = ["일", "월", "화", "수", "목", "금", "토"];
const weekEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WHEEL_ITEM_HEIGHT = 46;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_REPEAT_COUNT = 9;
const FIELD_ROW_HEIGHT = 80;
let activeMultilineFocusHandler = null;
let activeMultilineBlurHandler = null;

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateOf = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const todayKey = () => keyOf(new Date());
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const shiftDate = (key, days) => {
  const date = dateOf(key);
  date.setDate(date.getDate() + days);
  return keyOf(date);
};
const shiftMonth = (key, months) => {
  const date = dateOf(key);
  date.setMonth(date.getMonth() + months);
  return keyOf(date);
};
const monthLabel = (key) => {
  const date = dateOf(key);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
};
const prettyDate = (key) => {
  const date = dateOf(key);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekKo[date.getDay()]}요일`;
};
const compactDate = (key) => {
  const date = dateOf(key);
  return `${date.getMonth() + 1}/${date.getDate()} ${weekKo[date.getDay()]}`;
};
const parseTimeParts = (time) => {
  const [hour24, minute] = (time || "09:00").split(":").map(Number);
  return {
    period: hour24 < 12 ? "AM" : "PM",
    hour: hour24 % 12 || 12,
    minute: Number.isFinite(minute) ? minute : 0
  };
};
const buildTime = (period, hour, minute) => {
  const hour24 = period === "AM" ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);
  return `${pad(hour24)}:${pad(minute)}`;
};
const timeToMinutes = (time) => {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
};
const addMinutes = (time, minutesToAdd) => {
  const total = (timeToMinutes(time) + minutesToAdd + 24 * 60) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${pad(hour)}:${pad(minute)}`;
};
const COMPLETED_DOT_COLOR = "#aab4c6";
const getTaskPriority = (task) => {
  const priority = Number(task?.priority);
  return [1, 2, 3].includes(priority) ? priority : 3;
};
const isTaskDone = (task) => Boolean(task?.isCompleted ?? task?.done ?? task?.is_completed);
const getCalendarDotsForDate = (tasks, dateKey) => {
  const dateTasks = tasks.filter((task) => task.date === dateKey);
  const sorted = [...dateTasks].sort((a, b) => {
    const doneDiff = Number(isTaskDone(a)) - Number(isTaskDone(b));
    if (doneDiff !== 0) return doneDiff;
    if (!isTaskDone(a) && !isTaskDone(b)) return getTaskPriority(a) - getTaskPriority(b);
    return 0;
  });

  return sorted.slice(0, 3).map((task) => (
    isTaskDone(task) ? COMPLETED_DOT_COLOR : priorityColors[getTaskPriority(task)]
  ));
};
const formatClock = (time) => {
  if (!time) return "";
  const [hour, minute] = String(time).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const period = hour < 12 ? "\uC624\uC804" : "\uC624\uD6C4";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${pad(minute)}`;
};
const formatTaskTime = (task) => {
  if (!task) return "";
  if (task.isAllDay) return "\uC885\uC77C";
  const startTime = task.startTime || task.start_time || "";
  const endTime = task.endTime || task.end_time || "";
  const startDate = task.startDate || task.start_date || task.date || "";
  const endDate = task.endDate || task.end_date || task.date || "";
  if (startTime && endTime) {
    const sameDate = !startDate || !endDate || startDate === endDate;
    const dateLabel = sameDate ? "" : `${prettyDate(startDate)} `;
    const endDateLabel = sameDate ? "" : `${prettyDate(endDate)} `;
    return `${dateLabel}${formatClock(startTime)} ~ ${endDateLabel}${formatClock(endTime)}`;
  }
  if (startTime) return formatClock(startTime);
  return task.time || "";
};
const getReminderActualDate = (task) => {
  if (!task) return null;
  const reminderType = task.reminderType || task.reminder_type || "none";
  const reminderTimeValue = task.reminderTime || task.reminder_time || "";
  const reminderDateValue = task.reminderDate || task.reminder_date || task.date || "";
  if (reminderType === "none") return null;
  if (reminderType === "custom") {
    if (!reminderTimeValue) return null;
    return { dateKey: reminderDateValue, time: reminderTimeValue };
  }
  const startTime = task.startTime || task.start_time || "";
  if (!startTime || task.isAllDay || task.is_all_day) return null;
  const offsetMap = { at_start: 0, before_5: 5, before_10: 10, before_30: 30, before_60: 60 };
  if (!(reminderType in offsetMap)) return null;
  const dateKey = task.startDate || task.start_date || task.date;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const [hour, minute] = String(startTime).split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const triggerDate = new Date(year, month - 1, day, hour, minute);
  triggerDate.setMinutes(triggerDate.getMinutes() - offsetMap[reminderType]);
  return { dateKey: keyOf(triggerDate), time: `${pad(triggerDate.getHours())}:${pad(triggerDate.getMinutes())}` };
};
const formatReminderTime = (task) => {
  const reminder = getReminderActualDate(task);
  if (!reminder) return "";
  const needsDate = reminder.dateKey && task.date && reminder.dateKey !== task.date;
  return `${needsDate ? `${prettyDate(reminder.dateKey)} ` : ""}${formatClock(reminder.time)}`;
};
const formatReminder = (task) => {
  if (!task) return "\uC54C\uB9BC \uC5C6\uC74C";
  const reminderType = task.reminderType || task.reminder_type || "none";
  if (reminderType === "none") return "\uC54C\uB9BC \uC5C6\uC74C";
  const reminderTime = formatReminderTime(task);
  if (reminderType === "custom") {
    return reminderTime ? `${reminderTime} \u00b7 \uC9C1\uC811 \uC124\uC815` : "\uC9C1\uC811 \uC124\uC815";
  }
  const option = reminderOptions.find((item) => item.type === reminderType);
  if (!option) return task.alarm || "\uC54C\uB9BC \uC5C6\uC74C";
  return reminderTime ? `${reminderTime} \u00b7 ${option.label}` : option.label;
};
const hasStructuredTime = (task) => task.isAllDay || Boolean(task.startDate || task.startTime || task.endDate || task.endTime);
const loginProviderLabel = (provider) => {
  if (provider === "google") return "Google";
  if (provider === "email") return "이메일";
  return provider || "이메일";
};

export default function App() {
  const [screen, setScreen] = useState("login");
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authSession, setAuthSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [fields, setFields] = useState(defaultFields);
  const [notifications, setNotifications] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [calendarMode, setCalendarMode] = useState("month");
  const [taskSheetMode, setTaskSheetMode] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [fieldSheet, setFieldSheet] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    async function boot() {
      const authResult = await getCurrentAuthSession();
      const [savedSession, savedUsers, savedNotifications] = await Promise.all([
        loadStoredJson("session", null),
        loadStoredJson("users", []),
        loadStoredJson("notifications", true)
      ]);
      const nextSession = authResult.appSession || savedSession;
      const savedFields = await loadCategories(authResult.user?.id, defaultFields);
      const nextFields = normalizeFields(savedFields?.length ? savedFields : defaultFields);
      const nextTasks = await loadTasks(authResult.user?.id);
      const normalizedLoadedTasks = normalizeTasks(nextTasks || [], nextFields);
      const syncedTasks = savedNotifications
        ? await resyncTaskNotifications(normalizedLoadedTasks)
        : normalizedLoadedTasks;
      setAuthSession(authResult.authSession);
      setUser(authResult.user);
      setSession(nextSession);
      setUsers(savedUsers);
      setTasks(normalizeTasks(syncedTasks, nextFields));
      setFields(nextFields);
      setNotifications(savedNotifications);
      if (authResult.appSession) await saveStoredJson("session", authResult.appSession);
      setScreen(nextSession ? "main" : "login");
      setBooted(true);
    }
    boot();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAuthStateChange(async (nextAuth) => {
      setAuthSession(nextAuth.authSession);
      setUser(nextAuth.user);
      setSession(nextAuth.appSession);
      if (nextAuth.appSession) {
        const remoteFields = normalizeFields(await loadCategories(nextAuth.user?.id, defaultFields));
        const remoteTasks = await loadTasks(nextAuth.user?.id);
        const savedNotifications = await loadStoredJson("notifications", true);
        const normalizedRemoteTasks = normalizeTasks(remoteTasks || [], remoteFields);
        const syncedRemoteTasks = savedNotifications
          ? await resyncTaskNotifications(normalizedRemoteTasks)
          : normalizedRemoteTasks;
        setFields(remoteFields);
        setTasks(normalizeTasks(syncedRemoteTasks, remoteFields));
        await saveStoredJson("session", nextAuth.appSession);
        setScreen((current) => (current === "login" || current === "signup" ? "main" : current));
      } else {
        const localFields = normalizeFields((await loadCategories()) || defaultFields);
        const localTasks = await loadTasks();
        await cancelAllTaskNotifications();
        setFields(localFields);
        setTasks(normalizeTasks(localTasks || [], localFields));
        await removeStoredItem("session");
        setScreen((current) => (current === "settings" || current === "fields" || current === "main" ? "login" : current));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (booted) saveTasks(tasks, user?.id);
  }, [tasks, booted, user?.id]);

  useEffect(() => {
    if (booted) saveCategories(fields, user?.id);
  }, [fields, booted, user?.id]);

  useEffect(() => {
    if (booted) saveStoredJson("notifications", notifications);
  }, [notifications, booted]);

  const selectedTask = tasks.find((task) => task.id === detailTaskId);

  const login = async ({ username, password }) => {
    const email = username.trim();
    setAuthError("");
    if (!email) {
      setAuthError("이메일을 입력해주세요.");
      Alert.alert("로그인", "이메일을 입력해주세요.");
      return;
    }
    if (!isEmail(email)) {
      setAuthError("올바른 이메일 형식이 아니에요.");
      Alert.alert("로그인", "올바른 이메일 형식이 아니에요.");
      return;
    }
    if (!password) {
      setAuthError("비밀번호를 입력해주세요.");
      Alert.alert("로그인", "비밀번호를 입력해주세요.");
      return;
    }

    setIsAuthLoading(true);
    try {
      const result = await signInWithEmail({ email, password });
      setAuthSession(result.authSession);
      setUser(result.user);
      setSession(result.appSession);
      const remoteFields = normalizeFields(await loadCategories(result.user?.id, defaultFields));
      const remoteTasks = await loadTasks(result.user?.id);
      const normalizedRemoteTasks = normalizeTasks(remoteTasks || [], remoteFields);
      const syncedRemoteTasks = notifications
        ? await resyncTaskNotifications(normalizedRemoteTasks)
        : normalizedRemoteTasks;
      setFields(remoteFields);
      setTasks(normalizeTasks(syncedRemoteTasks, remoteFields));
      await saveStoredJson("session", result.appSession);
      if (result.profileError) {
        Alert.alert("프로필 안내", "로그인은 성공했지만 프로필 저장 확인이 필요해요. Supabase profiles RLS 정책을 확인해주세요.");
      }
      setScreen("main");
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      Alert.alert("로그인 실패", message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setAuthError("");
    setIsAuthLoading(true);
    try {
      const result = await signInWithGoogle();
      setAuthSession(result.authSession);
      setUser(result.user);
      setSession(result.appSession);
      const remoteFields = normalizeFields(await loadCategories(result.user?.id, defaultFields));
      const remoteTasks = await loadTasks(result.user?.id);
      const normalizedRemoteTasks = normalizeTasks(remoteTasks || [], remoteFields);
      const syncedRemoteTasks = notifications
        ? await resyncTaskNotifications(normalizedRemoteTasks)
        : normalizedRemoteTasks;
      setFields(remoteFields);
      setTasks(normalizeTasks(syncedRemoteTasks, remoteFields));
      await saveStoredJson("session", result.appSession);
      if (result.profileError) {
        Alert.alert("프로필 안내", "Google 로그인은 성공했지만 프로필 저장 확인이 필요해요. Supabase profiles RLS 정책을 확인해주세요.");
      }
      setScreen("main");
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      Alert.alert("Google 로그인 실패", message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signup = async ({ username, password, confirm, nickname }) => {
    const email = username.trim();
    setAuthError("");
    if (!email) {
      setAuthError("이메일을 입력해주세요.");
      Alert.alert("회원가입", "이메일을 입력해주세요.");
      return;
    }
    if (!isEmail(email)) {
      setAuthError("올바른 이메일 형식이 아니에요.");
      Alert.alert("회원가입", "올바른 이메일 형식이 아니에요.");
      return;
    }
    if (!nickname.trim()) {
      setAuthError("닉네임을 입력해주세요.");
      Alert.alert("회원가입", "닉네임을 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      setAuthError("비밀번호는 6자 이상 입력해주세요.");
      Alert.alert("회원가입", "비밀번호는 6자 이상 입력해주세요.");
      return;
    }
    if (password !== confirm) {
      setAuthError("비밀번호가 서로 달라요.");
      Alert.alert("회원가입", "비밀번호가 서로 달라요.");
      return;
    }

    setIsAuthLoading(true);
    try {
      const result = await signUpWithEmail({ email, password, nickname });
      if (result.needsEmailConfirmation) {
        Alert.alert("이메일 인증 필요", "회원가입은 완료됐어요. 메일함에서 인증을 완료한 뒤 로그인해주세요.");
        setScreen("login");
        return;
      }

      setAuthSession(result.authSession);
      setUser(result.user);
      setSession(result.appSession);
      const remoteFields = normalizeFields(await loadCategories(result.user?.id, defaultFields));
      const remoteTasks = await loadTasks(result.user?.id);
      const normalizedRemoteTasks = normalizeTasks(remoteTasks || [], remoteFields);
      const syncedRemoteTasks = notifications
        ? await resyncTaskNotifications(normalizedRemoteTasks)
        : normalizedRemoteTasks;
      setFields(remoteFields);
      setTasks(normalizeTasks(syncedRemoteTasks, remoteFields));
      await saveStoredJson("session", result.appSession);
      if (result.profileError) {
        Alert.alert("프로필 안내", "회원가입은 성공했지만 프로필 저장 확인이 필요해요. Supabase profiles RLS 정책을 확인해주세요.");
      }
      setScreen("main");
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      Alert.alert("회원가입 실패", message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = () => {
    Alert.alert("로그아웃", "로그아웃하시겠습니까?", [
      { text: "취소" },
      {
        text: "로그아웃",
        onPress: async () => {
          setIsAuthLoading(true);
          try {
            await cancelAllTaskNotifications();
            await signOutFromSupabase();
          } catch (error) {
            Alert.alert("로그아웃 안내", getAuthErrorMessage(error));
          }
          await removeStoredItem("session");
          setAuthSession(null);
          setUser(null);
          setSession(null);
          setIsAuthLoading(false);
          setScreen("login");
        }
      }
    ]);
  };

  const saveTask = async (taskInput) => {
    const field = fields.find((item) => item.id === taskInput.fieldId);
    const now = new Date().toISOString();
    const nextTaskInput = {
      ...taskInput,
      category: field?.name || taskInput.category || "미지정",
      priorityLabel: priorityCopy[taskInput.priority],
      isCompleted: editingTask ? Boolean(editingTask.isCompleted ?? editingTask.done) : false
    };
    let notificationIdToRollback = null;
    try {
      if (editingTask) {
        const nextTask = normalizeTaskRecord({ ...editingTask, ...nextTaskInput, updatedAt: now }, fields);
        const taskWithNotification = notifications
          ? await prepareTaskNotification(nextTask, editingTask, { showPermissionAlert: true, showPastAlert: true })
          : { ...nextTask, notificationId: null };
        if (!notifications && editingTask.notificationId) await cancelTaskNotification(editingTask.notificationId);
        notificationIdToRollback = taskWithNotification.notificationId;
        const savedTask = await updateTask(taskWithNotification, user?.id);
        const normalizedSavedTask = normalizeTaskRecord(savedTask, fields);
        setTasks((prev) => prev.map((task) => (task.id === editingTask.id ? normalizedSavedTask : task)));
        setDetailTaskId(normalizedSavedTask.id);
        setSelectedDate(taskInput.date);
      } else {
        const nextTask = normalizeTaskRecord({ ...nextTaskInput, id: makeId("task"), done: false, isCompleted: false, createdAt: now, updatedAt: now }, fields);
        const taskWithNotification = notifications
          ? await prepareTaskNotification(nextTask, null, { showPermissionAlert: true, showPastAlert: true })
          : { ...nextTask, notificationId: null };
        notificationIdToRollback = taskWithNotification.notificationId;
        const savedTask = await createTask(taskWithNotification, user?.id);
        setTasks((prev) => [normalizeTaskRecord(savedTask, fields), ...prev]);
        setSelectedDate(taskInput.date);
      }
      setEditingTask(null);
      setTaskSheetMode(null);
    } catch (error) {
      await cancelTaskNotification(notificationIdToRollback);
      Alert.alert("저장 실패", error.message || "할 일을 저장하지 못했어요. 네트워크 연결을 확인해주세요.");
    }
  };

  const toggleTask = async (id, done) => {
    const previousTasks = tasks;
    const updatedAt = new Date().toISOString();
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;

    try {
      const nextBaseTask = normalizeTaskRecord({ ...currentTask, done, isCompleted: done, updatedAt }, fields);
      const nextTask = notifications
        ? await prepareTaskNotification(nextBaseTask, currentTask, { showPermissionAlert: false, showPastAlert: false })
        : { ...nextBaseTask, notificationId: null };
      if (!notifications && currentTask.notificationId) await cancelTaskNotification(currentTask.notificationId);

      setTasks((prev) => prev.map((task) => (task.id === id ? nextTask : task)));
      if (user?.id) {
        const savedTask = await updateTask(nextTask, user.id);
        setTasks((prev) => prev.map((task) => (task.id === id ? normalizeTaskRecord(savedTask, fields) : task)));
      }
    } catch (error) {
      setTasks(previousTasks);
      Alert.alert("저장 실패", error.message || "완료 상태를 저장하지 못했어요. 네트워크 연결을 확인해주세요.");
    }
  };

  const deleteTask = (id) => {
    Alert.alert("삭제", "이 할 일을 삭제하시겠습니까?", [
      { text: "취소" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const previousTasks = tasks;
          const targetTask = tasks.find((task) => task.id === id);
          setTasks((prev) => prev.filter((task) => task.id !== id));
          setDetailTaskId(null);
          try {
            await cancelTaskNotification(targetTask?.notificationId);
            await deleteTaskById(id, user?.id);
          } catch (error) {
            setTasks(previousTasks);
            Alert.alert("삭제 실패", error.message || "할 일을 삭제하지 못했어요. 네트워크 연결을 확인해주세요.");
          }
        }
      }
    ]);
  };

  const upsertField = async (fieldInput) => {
    const normalizedName = fieldInput.name.trim();
    const duplicate = fields.some((field) => field.id !== fieldInput.id && field.name === normalizedName);
    if (duplicate) {
      Alert.alert("분야 안내", "같은 이름의 분야가 이미 있어요.");
      return;
    }

    try {
      if (fieldInput.id) {
        const previousField = fields.find((field) => field.id === fieldInput.id);
        const nextField = { ...previousField, ...fieldInput, name: normalizedName, sortOrder: previousField?.sortOrder ?? fields.findIndex((field) => field.id === fieldInput.id) };
        const savedField = await updateCategory(nextField, previousField, user?.id);
        setFields((prev) => prev.map((field) => (field.id === fieldInput.id ? savedField : field)));
        setTasks((prev) => prev.map((task) => (
          task.fieldId === fieldInput.id || task.category === previousField?.name
            ? { ...task, fieldId: savedField.id, category: savedField.name, updatedAt: new Date().toISOString() }
            : task
        )));
        setFieldSheet(null);
        return savedField;
      } else {
        const nextField = { ...fieldInput, name: normalizedName, id: makeId("field"), sortOrder: fields.length };
        const savedField = await createCategory(nextField, user?.id, fields.length);
        setFields((prev) => [...prev, savedField]);
        setFieldSheet(null);
        return savedField;
      }
    } catch (error) {
      Alert.alert("분야 저장 실패", error.message || "분야를 저장하지 못했어요. 네트워크 연결을 확인해주세요.");
      return null;
    }
  };

  const deleteField = (fieldId) => {
    const targetField = fields.find((field) => field.id === fieldId);
    if (!targetField) return;
    const used = tasks.some((task) => task.fieldId === fieldId);
    Alert.alert("분야 삭제", used ? "이 분야를 사용 중인 할 일은 ‘미지정’으로 변경됩니다." : "이 분야를 삭제하시겠습니까?", [
      { text: "취소" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const previousFields = fields;
          const previousTasks = tasks;
          setFields((prev) => prev.filter((field) => field.id !== fieldId));
          setTasks((prev) => prev.map((task) => (
            task.fieldId === fieldId || task.category === targetField.name
              ? { ...task, fieldId: "", category: "미지정", updatedAt: new Date().toISOString() }
              : task
          )));
          try {
            await deleteCategoryById(targetField, user?.id);
          } catch (error) {
            setFields(previousFields);
            setTasks(previousTasks);
            Alert.alert("분야 삭제 실패", error.message || "분야를 삭제하지 못했어요. 네트워크 연결을 확인해주세요.");
          }
        }
      }
    ]);
  };

  const reorderFields = async (nextFields) => {
    const previousFields = fields;
    const orderedFields = nextFields.map((field, index) => ({
      ...field,
      sortOrder: index,
      updatedAt: new Date().toISOString()
    }));

    setFields(orderedFields);
    try {
      const savedFields = await updateCategoryOrder(orderedFields, user?.id);
      setFields(normalizeFields(savedFields));
    } catch (error) {
      setFields(previousFields);
      Alert.alert("순서 저장 실패", error.message || "분야 순서를 저장하지 못했어요. 네트워크 연결을 확인해주세요.");
    }
  };

  const changeNotifications = (nextValue) => {
    if (!nextValue) {
      Alert.alert("알림 끄기", "알림을 끄면 예약된 할 일 알림도 함께 취소돼요.", [
        { text: "취소" },
        {
          text: "끄기",
          onPress: async () => {
            await cancelAllTaskNotifications();
            const now = new Date().toISOString();
            const nextTasks = tasks.map((task) => ({ ...task, notificationId: null, updatedAt: now }));
            setTasks(nextTasks);
            if (user?.id) {
              await Promise.all(nextTasks.map((task) => updateTask(task, user.id)));
            }
            setNotifications(false);
          }
        }
      ]);
      return;
    }
    setNotifications(true);
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      {screen === "login" && <LoginScreen onLogin={login} onGoogleLogin={loginWithGoogle} onSignup={() => { setAuthError(""); setScreen("signup"); }} authError={authError} loading={isAuthLoading} />}
      {screen === "signup" && <SignupScreen onBack={() => { setAuthError(""); setScreen("login"); }} onSignup={signup} authError={authError} loading={isAuthLoading} />}
      {screen === "main" && (
        <MainScreen
          tasks={tasks}
          fields={fields}
          selectedDate={selectedDate}
          calendarMode={calendarMode}
          onSelectDate={setSelectedDate}
          onChangeMode={setCalendarMode}
          onSettings={() => setScreen("settings")}
          onOpenAdd={() => {
            setEditingTask(null);
            setTaskSheetMode("add");
          }}
          onOpenTask={setDetailTaskId}
          onToggleTask={toggleTask}
        />
      )}
      {screen === "settings" && (
        <SettingsScreen
          session={session}
          fields={fields}
          notifications={notifications}
          onChangeNotifications={changeNotifications}
          onBack={() => setScreen("main")}
          onFields={() => setScreen("fields")}
          onLogout={logout}
        />
      )}
      {screen === "fields" && (
        <FieldsScreen
          fields={fields}
          tasks={tasks}
          onBack={() => setScreen("settings")}
          onAdd={() => setFieldSheet({ mode: "add" })}
          onEdit={(field) => setFieldSheet({ mode: "edit", field })}
          onDelete={deleteField}
          onReorder={reorderFields}
        />
      )}
      <TaskSheet
        visible={!!taskSheetMode}
        mode={taskSheetMode}
        initialTask={editingTask}
        selectedDate={selectedDate}
        fields={fields}
        onClose={() => {
          setTaskSheetMode(null);
          setEditingTask(null);
        }}
        onAddField={upsertField}
        onSubmit={saveTask}
      />
      <TaskDetailSheet
        task={selectedTask}
        fields={fields}
        onClose={() => setDetailTaskId(null)}
        onToggle={(done, taskId) => toggleTask(taskId, done)}
        onEdit={(task) => {
          setEditingTask(task);
          setDetailTaskId(null);
          setTaskSheetMode("edit");
        }}
        onDelete={(taskId) => deleteTask(taskId)}
      />
      <FieldSheet visible={!!fieldSheet} field={fieldSheet?.field} onClose={() => setFieldSheet(null)} onSubmit={upsertField} />
    </SafeAreaView>
  );
}

function normalizeTaskRecord(task, fields = defaultFields) {
  const priority = [1, 2, 3].includes(Number(task.priority)) ? Number(task.priority) : 3;
  const fieldId = task.fieldId === "health" ? "schedule" : task.fieldId;
  const field = fields.find((item) => item.id === fieldId || item.name === task.category);
  const done = Boolean(task.isCompleted ?? task.done);
  return {
    ...task,
    id: task.id || makeId("task"),
    title: task.title || "",
    date: task.date || todayKey(),
    fieldId: field?.id || fieldId || "",
    category: field?.name || task.category || "미지정",
    priority,
    priorityLabel: priorityCopy[priority],
    done,
    isCompleted: done,
    isAllDay: Boolean(task.isAllDay ?? task.is_all_day),
    startDate: task.startDate || task.start_date || task.date || null,
    startTime: (task.isAllDay ?? task.is_all_day) ? null : task.startTime || task.start_time || null,
    endDate: task.endDate || task.end_date || task.date || null,
    endTime: (task.isAllDay ?? task.is_all_day) ? null : task.endTime || task.end_time || null,
    reminderType: task.reminderType || task.reminder_type || (task.alarm ? "custom" : "none"),
    reminderDate: task.reminderDate || task.reminder_date || task.date || null,
    reminderTime: (task.reminderType || task.reminder_type) === "custom" || task.reminderTime || task.reminder_time ? task.reminderTime || task.reminder_time || null : null,
    notificationId: task.notificationId || task.notification_id || null,
    sortOrder: Number.isFinite(Number(task.sortOrder ?? task.sort_order)) ? Number(task.sortOrder ?? task.sort_order) : null,
    memo: task.memo || "",
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
  };
}

function normalizeTasks(items, fields = defaultFields) {
  return items.filter(Boolean).map((task) => normalizeTaskRecord(task, fields));
}

function normalizeFields(items) {
  const cleaned = items
    .filter((field) => field.id !== "health" && field.name !== "건강관리")
    .map((field, index) => ({
      ...field,
      sortOrder: Number.isFinite(Number(field.sortOrder)) ? Number(field.sortOrder) : index
    }));
  const hasSchedule = cleaned.some((field) => field.id === "schedule");
  const withSchedule = hasSchedule ? cleaned : [...cleaned, { id: "schedule", name: "일정", color: "#16b8c9", sortOrder: cleaned.length }];
  return withSchedule.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function LoginScreen({ onLogin, onGoogleLogin, onSignup, authError, loading }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.loginScreen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.loginTop}>
          <View style={styles.appIcon}><Text style={styles.appIconText}>D</Text></View>
          <Text style={styles.brand}>DooDoo</Text>
          <Text style={styles.sub}>오늘 할 일을 관리하세요</Text>
        </View>
        <Divider label="이메일로 로그인" />
        <Input label="이메일 *" value={username} onChangeText={setUsername} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address" />
        <Input label="비밀번호 *" value={password} onChangeText={setPassword} placeholder="비밀번호를 입력하세요" secureTextEntry />
        {!!authError && <Text style={styles.authError}>{authError}</Text>}
        <PrimaryButton label={loading ? "로그인 중..." : "로그인"} onPress={() => onLogin({ username, password })} disabled={loading || !username.trim() || !password.trim()} />
        <Divider label="소셜 로그인" />
        <View style={styles.socials}>
          <SocialButton icon="G" label={loading ? "Google 연결 중..." : "Google로 계속하기"} bg="#ffffff" fg={INK} onPress={onGoogleLogin} disabled={loading} />
          <SocialButton icon="K" label="카카오로 계속하기" bg="#ffdf00" fg="#231815" onPress={() => Alert.alert("준비 중", "카카오 로그인은 나중에 만들 예정이에요.")} />
          <SocialButton icon="A" label="Apple로 계속하기" bg="#000000" fg="#ffffff" onPress={() => Alert.alert("준비 중", "Apple 로그인은 나중에 만들 예정이에요.")} />
        </View>
        <View style={styles.signupBox}>
          <View>
            <Text style={styles.signupTitle}>아직 계정이 없으신가요?</Text>
            <Text style={styles.signupSub}>지금 가입하고 시작해요</Text>
          </View>
          <Pressable style={styles.whitePill} onPress={onSignup}><Text style={styles.whitePillText}>회원가입</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SignupScreen({ onBack, onSignup, authError, loading }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <TopBar title="회원가입" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Input label="이메일 *" value={username} onChangeText={setUsername} placeholder="이메일을 입력하세요" autoCapitalize="none" keyboardType="email-address" />
        <HelperText ok={isEmail(username)} text="이메일 형식으로 입력해주세요" />
        <Input label="비밀번호 *" value={password} onChangeText={setPassword} placeholder="비밀번호를 입력하세요" secureTextEntry />
        <HelperText ok={password.length >= 6} text="비밀번호는 6자 이상 입력해주세요" />
        <Input label="비밀번호 확인 *" value={confirm} onChangeText={setConfirm} placeholder="비밀번호를 다시 입력하세요" secureTextEntry />
        <HelperText ok={!!confirm && password === confirm} text={confirm ? "일치해요" : "비밀번호 확인을 입력해주세요"} />
        <Input label={`닉네임 * ${nickname.length}/12`} value={nickname} onChangeText={(value) => setNickname(value.slice(0, 12))} placeholder="닉네임을 입력하세요" />
        {!!authError && <Text style={styles.authError}>{authError}</Text>}
        <PrimaryButton label={loading ? "가입 중..." : "회원가입"} onPress={() => onSignup({ username, password, confirm, nickname })} disabled={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MainScreen({ tasks, fields, selectedDate, calendarMode, onSelectDate, onChangeMode, onSettings, onOpenAdd, onOpenTask, onToggleTask }) {
  const selectedTasks = tasks.filter((task) => task.date === selectedDate).sort(compareTasks);
  const doneCount = selectedTasks.filter((task) => task.done).length;
  return (
    <View style={styles.screen}>
      <View style={styles.mainHeader}>
        <Text style={styles.mainLogo}>DooDoo</Text>
        <ModeSwitch value={calendarMode} onChange={onChangeMode} />
        <CircleButton text="⚙" onPress={onSettings} />
      </View>
      <Calendar mode={calendarMode} selectedDate={selectedDate} tasks={tasks} onSelect={onSelectDate} />
      <View style={styles.dividerLine} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
        <View style={styles.daySummary}>
          <Text style={styles.dayTitle}>{selectedTasks.length}개의 할 일</Text>
          <Text style={styles.dayDate}>{prettyDate(selectedDate)}</Text>
          <Text style={styles.completeText}>{doneCount}/{selectedTasks.length || 1} 완료</Text>
        </View>
        {[1, 2, 3].map((priority) => (
          <PrioritySection
            key={priority}
            priority={priority}
            tasks={selectedTasks.filter((task) => task.priority === priority)}
            fields={fields}
            onOpenTask={onOpenTask}
            onToggleTask={onToggleTask}
          />
        ))}
      </ScrollView>
      <Pressable style={styles.fab} onPress={onOpenAdd}><Text style={styles.fabText}>+</Text></Pressable>
    </View>
  );
}

function compareTasks(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const aHasTime = Boolean(a.startTime);
  const bHasTime = Boolean(b.startTime);
  if (aHasTime && bHasTime && a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
  const aCreated = a.createdAt || "";
  const bCreated = b.createdAt || "";
  if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
  return a.title.localeCompare(b.title);
}

function Calendar({ mode, selectedDate, tasks, onSelect }) {
  const selected = dateOf(selectedDate);
  const swipeX = useRef(new Animated.Value(0)).current;
  const isCalendarAnimating = useRef(false);
  const days = useMemo(() => {
    if (mode === "week") {
      const start = new Date(selected);
      start.setDate(selected.getDate() - selected.getDay());
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return keyOf(date);
      });
    }
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return keyOf(date);
    });
  }, [mode, selectedDate]);

  const getMovedDate = useCallback((direction) => {
    return mode === "week"
      ? shiftDate(selectedDate, direction * 7)
      : shiftMonth(selectedDate, direction);
  }, [mode, selectedDate]);

  const moveCalendar = useCallback((direction, animated = false) => {
    if (isCalendarAnimating.current) return;
    const nextDate = getMovedDate(direction);
    if (!animated) {
      onSelect(nextDate);
      return;
    }

    isCalendarAnimating.current = true;
    const outX = direction > 0 ? -140 : 140;
    Animated.timing(swipeX, {
      toValue: outX,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      onSelect(nextDate);
      swipeX.setValue(-outX);
      Animated.timing(swipeX, {
        toValue: 0,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(() => {
        swipeX.setValue(0);
        isCalendarAnimating.current = false;
      });
    });
  }, [getMovedDate, onSelect, swipeX]);

  const calendarPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      return !isCalendarAnimating.current && absX > 10 && absX > absY * 1.25;
    },
    onPanResponderMove: (_, gesture) => {
      const clamped = Math.max(-120, Math.min(120, gesture.dx));
      swipeX.setValue(clamped);
    },
    onPanResponderRelease: (_, gesture) => {
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      const threshold = 50;
      if (absX >= threshold && absX > absY * 1.25) {
        moveCalendar(gesture.dx < 0 ? 1 : -1, true);
        return;
      }
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(swipeX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4
      }).start();
    }
  }), [moveCalendar, swipeX]);

  return (
    <View>
      <View style={styles.monthNav}>
        <Pressable onPress={() => moveCalendar(-1)}><Text style={styles.navArrow}>‹</Text></Pressable>
        <Text style={styles.monthTitle}>{monthLabel(selectedDate)}</Text>
        <Pressable onPress={() => moveCalendar(1)}><Text style={styles.navArrow}>›</Text></Pressable>
      </View>
      <Animated.View {...calendarPanResponder.panHandlers} style={{ transform: [{ translateX: swipeX }] }}>
        <View style={styles.weekRow}>
          {(mode === "week" ? weekEn : weekKo).map((day, index) => (
            <Text key={day} style={[styles.weekLabel, index === 0 && styles.sun, index === 6 && styles.sat]}>{day}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {days.map((key) => {
            const date = dateOf(key);
            const dots = getCalendarDotsForDate(tasks, key);
            const isSelected = key === selectedDate;
            const faded = mode === "month" && date.getMonth() !== selected.getMonth();
            return (
              <Pressable key={key} onPress={() => onSelect(key)} style={[styles.dayCell, mode === "week" && styles.weekCell, isSelected && styles.selectedDay]}>
                <Text style={[styles.dayNum, faded && styles.faded, date.getDay() === 0 && styles.sun, date.getDay() === 6 && styles.sat, isSelected && styles.selectedDayText]}>{date.getDate()}</Text>
                <View style={styles.dots}>
                  {dots.map((color, index) => <View key={`${key}-${index}`} style={[styles.dot, { backgroundColor: color }, isSelected && styles.selectedDot]} />)}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

function TaskSheet({ visible, mode, initialTask, selectedDate, fields, onClose, onAddField, onSubmit }) {
  const sheetScrollRef = useRef(null);
  const memoFocusedRef = useRef(false);
  const sheetDrag = useBottomSheetDrag(onClose, visible);
  const baseDate = selectedDate || todayKey();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(baseDate);
  const [fieldId, setFieldId] = useState(fields[0]?.id || "");
  const [priority, setPriority] = useState(null);
  const [hasTime, setHasTime] = useState(false);
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(baseDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(baseDate);
  const [endTime, setEndTime] = useState("10:00");
  const [reminderType, setReminderType] = useState("none");
  const [reminderDate, setReminderDate] = useState(baseDate);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [memo, setMemo] = useState("");
  const [fieldScroll, setFieldScroll] = useState({ x: 0, content: 1, width: 1 });
  const [timePicker, setTimePicker] = useState(null);
  const [datePicker, setDatePicker] = useState(null);
  const [quickFieldOpen, setQuickFieldOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const initialHasTime = Boolean(initialTask && hasStructuredTime(initialTask));
    setTitle(initialTask?.title || "");
    setDate(initialTask?.date || baseDate);
    setFieldId(initialTask?.fieldId || fields[0]?.id || "");
    setPriority(initialTask?.priority || null);
    setHasTime(initialHasTime);
    setIsAllDay(Boolean(initialTask?.isAllDay));
    setStartDate(initialTask?.startDate || initialTask?.date || baseDate);
    setStartTime(initialTask?.startTime || "09:00");
    setEndDate(initialTask?.endDate || initialTask?.date || baseDate);
    setEndTime(initialTask?.endTime || "10:00");
    setReminderType(initialTask?.reminderType || "none");
    setReminderDate(initialTask?.reminderDate || initialTask?.date || baseDate);
    setReminderTime(initialTask?.reminderTime || "09:00");
    setMemo(initialTask?.memo || "");
  }, [visible, initialTask, baseDate]);

  useEffect(() => {
    if (!visible) return;
    if (!fieldId && fields[0]?.id) setFieldId(fields[0].id);
    if (fieldId && !fields.some((field) => field.id === fieldId) && fields[0]?.id) setFieldId(fields[0].id);
  }, [visible, fields, fieldId]);

  const scrollToMemoInput = useCallback((delay = 260) => {
    setTimeout(() => {
      sheetScrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    activeMultilineFocusHandler = () => {
      memoFocusedRef.current = true;
      scrollToMemoInput(260);
      scrollToMemoInput(520);
    };
    activeMultilineBlurHandler = () => {
      memoFocusedRef.current = false;
    };
    return () => {
      activeMultilineFocusHandler = null;
      activeMultilineBlurHandler = null;
      memoFocusedRef.current = false;
    };
  }, [visible, scrollToMemoInput]);

  useEffect(() => {
    if (!visible) return undefined;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(showEvent, () => {
      if (memoFocusedRef.current) {
        scrollToMemoInput(80);
      }
    });
    return () => subscription.remove();
  }, [visible, scrollToMemoInput]);

  const valid = title.trim() && date && fieldId && priority;
  const relativeReminderNeedsTime = reminderOptions.find((item) => item.type === reminderType)?.needsStartTime;
  const reminderDisabled = (!hasTime || isAllDay) && relativeReminderNeedsTime;
  const scrollThumbWidth = Math.max(28, (fieldScroll.width / fieldScroll.content) * fieldScroll.width);
  const scrollThumbLeft = fieldScroll.content <= fieldScroll.width ? 0 : (fieldScroll.x / (fieldScroll.content - fieldScroll.width)) * (fieldScroll.width - scrollThumbWidth);
  const submit = () => {
    if (!valid) {
      Alert.alert("필수 항목", "할 일, 날짜, 분야, 우선순위를 입력해주세요.");
      return;
    }
    if (reminderDisabled) {
      Alert.alert("알림 설정", "시작 시간을 설정하면 이 알림 옵션을 사용할 수 있어요.");
      return;
    }
    onSubmit({
      title: title.trim(),
      date,
      fieldId,
      priority,
      isAllDay: hasTime ? isAllDay : false,
      startDate: hasTime ? startDate : null,
      startTime: hasTime && !isAllDay ? startTime : null,
      endDate: hasTime ? endDate : null,
      endTime: hasTime && !isAllDay ? endTime : null,
      reminderType,
      reminderDate: reminderType === "custom" ? reminderDate : null,
      reminderTime: reminderType === "custom" ? reminderTime : null,
      memo: memo.trim(),
      time: "",
      alarm: ""
    });
  };

  const openTimePicker = (target, label, value) => {
    const fallback = target === "end" ? addMinutes(startTime || "09:00", 60) : "09:00";
    setTimePicker({ target, label, value: value || fallback });
  };
  const applyPickedTime = (value) => {
    if (timePicker?.target === "start") {
      setStartTime(value);
      if (startDate === endDate && timeToMinutes(endTime) <= timeToMinutes(value)) {
        setEndTime(addMinutes(value, 60));
      }
    }
    if (timePicker?.target === "end") {
      if (startDate === endDate && timeToMinutes(value) <= timeToMinutes(startTime)) {
        setEndTime(addMinutes(startTime, 60));
      } else {
        setEndTime(value);
      }
    }
    if (timePicker?.target === "reminder") setReminderTime(value);
    setTimePicker(null);
  };
  const selectReminder = (option) => {
    if (option.needsStartTime && (!hasTime || isAllDay)) return;
    setReminderType(option.type);
    if (option.type === "custom") {
      setReminderDate(reminderDate || date);
      openTimePicker("reminder", "알림 시간 선택", reminderTime || "09:00");
    }
  };
  const openDatePicker = (target, label, value) => setDatePicker({ target, label, value });
  const applyPickedDate = (value) => {
    if (datePicker?.target === "start") setStartDate(value);
    if (datePicker?.target === "end") setEndDate(value);
    if (datePicker?.target === "reminder") setReminderDate(value);
    setDatePicker(null);
  };

  return (
    <>
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheet}>
          <SheetHandle panHandlers={sheetDrag.panHandlers} />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{mode === "edit" ? "할 일 수정" : "할 일 추가"}</Text>
            <CircleButton text="×" onPress={onClose} />
          </View>
          <ScrollView
            ref={sheetScrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetScrollContent}
          >
            <Input label="할 일 *" value={title} onChangeText={setTitle} placeholder="할 일을 입력하세요" />
            <FieldLabel label="날짜 *" />
            <StepperBox text={prettyDate(date)} onLeft={() => setDate(shiftDate(date, -1))} onRight={() => setDate(shiftDate(date, 1))} />
            <FieldLabel label="분야 *" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                setFieldScroll((current) => ({ ...current, width }));
              }}
              onContentSizeChange={(width) => setFieldScroll((current) => ({ ...current, content: width }))}
              onScroll={(event) => {
                const x = event.nativeEvent.contentOffset.x;
                setFieldScroll((current) => ({ ...current, x }));
              }}
              scrollEventThrottle={16}
            >
              {fields.map((field) => <Chip key={field.id} field={field} active={fieldId === field.id} onPress={() => setFieldId(field.id)} />)}
              <Pressable style={styles.addChip} onPress={() => {
                Keyboard.dismiss();
                setQuickFieldOpen(true);
              }}><Text style={styles.addChipText}>+ 분야</Text></Pressable>
            </ScrollView>
            {fieldScroll.content > fieldScroll.width && (
              <View style={styles.scrollHintTrack}>
                <View style={[styles.scrollHintThumb, { width: scrollThumbWidth, transform: [{ translateX: scrollThumbLeft }] }]} />
              </View>
            )}
            <FieldLabel label="우선순위 *" />
            <View style={styles.priorityPills}>
              {[1, 2, 3].map((item) => (
                <Pressable key={item} style={[styles.priorityPill, priority === item && { borderColor: priorityColors[item], backgroundColor: `${priorityColors[item]}18` }]} onPress={() => setPriority(item)}>
                  <Text style={[styles.priorityPillText, priority === item && { color: priorityColors[item] }]}>{item}순위</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.priorityHint}>{priority ? priorityCopy[priority] : "순위를 선택하면 설명이 표시됩니다"}</Text>
            <FieldLabel label="시간  선택" />
            {!hasTime ? (
              <Pressable style={styles.optionalButton} onPress={() => {
                setHasTime(true);
                setStartDate(date || baseDate);
                setEndDate(date || baseDate);
              }}>
                <Text style={styles.optionalButtonText}>시간 추가</Text>
              </Pressable>
            ) : (
              <View style={styles.optionPanel}>
                <View style={styles.timeAllDayRow}>
                  <Text style={styles.timeAllDayText}>종일</Text>
                  <Switch value={isAllDay} onValueChange={setIsAllDay} trackColor={{ true: BLUE }} />
                </View>
                <CompactTimeRow
                  label="시작"
                  date={startDate}
                  time={startTime}
                  isAllDay={isAllDay}
                  onPressDate={() => openDatePicker("start", "시작 날짜 선택", startDate)}
                  onPressTime={() => openTimePicker("start", "시작 시간 선택", startTime)}
                />
                <CompactTimeRow
                  label="종료"
                  date={endDate}
                  time={endTime}
                  isAllDay={isAllDay}
                  onPressDate={() => openDatePicker("end", "종료 날짜 선택", endDate)}
                  onPressTime={() => openTimePicker("end", "종료 시간 선택", endTime)}
                />
                <Pressable style={styles.clearOptionButton} onPress={() => {
                  setHasTime(false);
                  setIsAllDay(false);
                  setReminderType(reminderType === "custom" ? "custom" : "none");
                }}>
                  <Text style={styles.clearOptionText}>시간 제거</Text>
                </Pressable>
              </View>
            )}
            <FieldLabel label="알림  선택" />
            <View style={styles.reminderGrid}>
              {reminderOptions.map((option) => {
                const disabled = option.needsStartTime && (!hasTime || isAllDay);
                return (
                  <Pressable
                    key={option.type}
                    disabled={disabled}
                    style={[styles.reminderChip, reminderType === option.type && styles.reminderChipActive, disabled && styles.reminderChipDisabled]}
                    onPress={() => selectReminder(option)}
                  >
                    <Text style={[styles.reminderChipText, reminderType === option.type && styles.reminderChipTextActive, disabled && styles.reminderChipTextDisabled]}>
                      {option.type === "custom" && reminderType === "custom" ? `직접 설정: ${formatClock(reminderTime)}` : option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {(!hasTime || isAllDay) && reminderType !== "custom" && <Text style={styles.optionHelp}>시작 시간을 설정하면 몇 분 전 알림을 사용할 수 있어요.</Text>}
            {reminderType === "custom" && <Text style={styles.optionHelp}>직접 설정 알림은 {formatClock(reminderTime)}에 표시돼요.</Text>}
            <OptionalInput label="메모" value={memo} setValue={setMemo} placeholder="메모 추가" multiline />
            <PrimaryButton label={mode === "edit" ? "수정하기" : "추가하기"} disabled={!valid} onPress={submit} />
          </ScrollView>
          </KeyboardAvoidingView>
          </Animated.View>
          {!!timePicker && (
            <TimePickerInlineOverlay
              title={timePicker?.label || "시간 선택"}
              value={timePicker?.value || "09:00"}
              onCancel={() => setTimePicker(null)}
              onConfirm={applyPickedTime}
            />
          )}
          {quickFieldOpen && (
            <QuickFieldSheet
              onClose={() => setQuickFieldOpen(false)}
              onSubmit={async (fieldInput) => {
                const savedField = await onAddField?.(fieldInput);
                if (savedField?.id) {
                  setFieldId(savedField.id);
                  setQuickFieldOpen(false);
                }
              }}
            />
          )}
        </View>
      </Modal>
      <DatePickerModal
        visible={!!datePicker}
        title={datePicker?.label || "날짜 선택"}
        value={datePicker?.value || date}
        onCancel={() => setDatePicker(null)}
        onConfirm={applyPickedDate}
      />
    </>
  );
}

function TaskDetailSheet({ task, fields, onClose, onToggle, onEdit, onDelete }) {
  const [displayTask, setDisplayTask] = useState(null);
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!task) return;
    setDisplayTask((current) => {
      if (current?.id === task.id) return task;
      progress.setValue(0);
      dragY.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      return task;
    });
  }, [task, progress, dragY]);

  const closeSheet = (afterClose) => {
    Animated.parallel([
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(dragY, {
        toValue: 260,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true
      })
    ]).start(({ finished }) => {
      if (finished) {
        dragY.setValue(0);
        setDisplayTask(null);
        onClose();
        if (typeof afterClose === "function") setTimeout(afterClose, 0);
      }
    });
  };

  const sheetPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => {
      dragY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 120 || gesture.vy > 1.1) {
        closeSheet();
        return;
      }
      Animated.spring(dragY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4
      }).start();
    }
  }), [dragY, closeSheet]);

  if (!displayTask) return null;

  const field = fields.find((item) => item.id === displayTask.fieldId);
  const detailTime = formatTaskTime(displayTask);
  const detailReminder = formatReminder(displayTask);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0]
  });
  const sheetTranslateY = Animated.add(translateY, dragY);
  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });
  const editTask = () => {
    const taskToEdit = displayTask;
    if (!taskToEdit) return;
    closeSheet(() => onEdit(taskToEdit));
  };
  const requestDeleteTask = () => {
    const taskId = displayTask?.id;
    if (!taskId) return;
    closeSheet(() => onDelete(taskId));
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={closeSheet}>
      <View style={styles.detailModalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet}>
          <Animated.View style={[styles.detailOverlay, { opacity: overlayOpacity }]} />
        </Pressable>
        <Animated.View style={[styles.detailSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View {...sheetPanResponder.panHandlers} style={styles.sheetDragArea}>
            <SheetHandle />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
            <View style={styles.detailActions}>
                <Pressable style={styles.statusPill} onPress={() => onToggle(!displayTask.done, displayTask.id)}>
                <Text style={styles.statusText}>{displayTask.done ? "완료" : "미완료"}</Text>
              </Pressable>
              <View style={styles.actionGroup}>
                <Pressable style={styles.actionPill} onPress={editTask}><Text style={styles.actionText}>수정</Text></Pressable>
                <Pressable style={styles.deletePill} onPress={requestDeleteTask}><Text style={styles.deleteText}>삭제</Text></Pressable>
                <CircleButton text="×" onPress={closeSheet} />
              </View>
            </View>
            <Text style={styles.detailTitle}>{displayTask.title}</Text>
            <View style={styles.detailGrid}>
              <DetailBox label="날짜" value={prettyDate(displayTask.date)} />
              <DetailBox label="우선순위" value={`${displayTask.priority}순위`} sub={priorityCopy[displayTask.priority]} color={priorityColors[displayTask.priority]} active />
              <DetailBox label="분야" value={field?.name || "미지정"} dot={field?.color} />
              <DetailBox label="완료 여부" value={displayTask.done ? "완료" : "미완료"} />
            </View>
            <DetailBox label="시간" value={detailTime || "시간 없음"} wide />
            <DetailBox label="알림" value={detailReminder} wide />
            <DetailBox label="메모" value={displayTask.memo || "메모가 없어요"} wide />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SettingsScreen({ session, fields, notifications, onChangeNotifications, onBack, onFields, onLogout }) {
  return (
    <View style={styles.screen}>
      <TopBar title="설정" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}>
        <Text style={styles.settingsSection}>내 계정</Text>
        <View style={styles.accountCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(session?.nickname || "D").slice(0, 1).toUpperCase()}</Text></View>
          <View>
            <Text style={styles.accountName}>{session?.nickname || "DooDoo User"}</Text>
            <Text style={styles.accountEmail}>{session?.email || "user@doodoo.app"}</Text>
            <Text style={styles.loginType}>● {loginProviderLabel(session?.loginType || session?.provider)}로 로그인</Text>
          </View>
        </View>
        <MenuGroup>
          <MenuItem icon="♙" label="프로필 수정" onPress={() => Alert.alert("준비 중", "프로필 수정은 다음 단계에서 연결할게요.")} />
          <MenuItem icon="⌁" label="연결된 계정" onPress={() => Alert.alert("준비 중", "계정 연결은 나중에 만들 예정이에요.")} />
        </MenuGroup>
        <Text style={styles.settingsSection}>알림</Text>
        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>♧</Text>
          <Text style={styles.menuLeft}>알림</Text>
          <Switch value={notifications} onValueChange={onChangeNotifications} trackColor={{ true: BLUE }} />
        </View>
        <Text style={styles.settingsSection}>분야</Text>
        <MenuGroup><MenuItem icon="⌘" label="분야 관리" right={`${fields.length}개`} onPress={onFields} /></MenuGroup>
        <Text style={styles.settingsSection}>서비스 정보</Text>
        <MenuGroup>
          <MenuItem icon="◇" label="이용약관" onPress={() => Alert.alert("이용약관", "준비 중입니다.")} />
          <MenuItem icon="ⓘ" label="개인정보 처리방침" onPress={() => Alert.alert("개인정보 처리방침", "준비 중입니다.")} />
          <MenuItem icon="D" label="앱 버전" right="1.0.0" />
        </MenuGroup>
        <Pressable onPress={onLogout}><Text style={styles.logoutText}>로그아웃</Text></Pressable>
      </ScrollView>
    </View>
  );
}

function FieldsScreen({ fields, tasks, onBack, onAdd, onEdit, onDelete, onReorder }) {
  const [orderedFields, setOrderedFields] = useState(fields);
  const [draggingFieldId, setDraggingFieldId] = useState(null);

  useEffect(() => {
    setOrderedFields(fields);
  }, [fields]);

  const finishDrag = useCallback((fieldId, dragY) => {
    setDraggingFieldId(null);
    const fromIndex = orderedFields.findIndex((field) => field.id === fieldId);
    if (fromIndex < 0) return;
    const offset = Math.round(dragY / FIELD_ROW_HEIGHT);
    const toIndex = Math.max(0, Math.min(orderedFields.length - 1, fromIndex + offset));
    if (fromIndex === toIndex) return;

    const nextFields = [...orderedFields];
    const [movingField] = nextFields.splice(fromIndex, 1);
    nextFields.splice(toIndex, 0, movingField);
    const ordered = nextFields.map((field, index) => ({ ...field, sortOrder: index }));
    setOrderedFields(ordered);
    onReorder?.(ordered);
  }, [onReorder, orderedFields]);

  return (
    <View style={styles.screen}>
      <TopBar title="분야 관리" onBack={onBack} />
      <ScrollView scrollEnabled={!draggingFieldId} showsVerticalScrollIndicator={false} contentContainerStyle={styles.fieldsScroll}>
        {orderedFields.map((field, index) => (
          <DraggableFieldRow
            key={field.id}
            field={field}
            index={index}
            itemCount={orderedFields.length}
            count={tasks.filter((task) => task.fieldId === field.id || task.category === field.name).length}
            dragging={draggingFieldId === field.id}
            onDragStart={() => setDraggingFieldId(field.id)}
            onDragEnd={(dragY) => finishDrag(field.id, dragY)}
            onEdit={() => onEdit(field)}
            onDelete={() => onDelete(field.id)}
          />
        ))}
        <PrimaryButton label="새 분야 추가" onPress={onAdd} />
      </ScrollView>
    </View>
  );
}

function DraggableFieldRow({ field, index, itemCount, count, dragging, onDragStart, onDragEnd, onEdit, onDelete }) {
  const dragY = useRef(new Animated.Value(0)).current;
  const latestDragY = useRef(0);
  const hasMovedRef = useRef(false);
  const suppressOpenRef = useRef(false);
  const lastIndexRef = useRef(index);
  const lastIndexHapticAtRef = useRef(0);

  useEffect(() => {
    if (!dragging) {
      latestDragY.current = 0;
      lastIndexRef.current = index;
      lastIndexHapticAtRef.current = 0;
      dragY.setValue(0);
    }
  }, [dragging, dragY, index]);

  const finishDrag = useCallback((value) => {
    dragY.setValue(0);
    if (hasMovedRef.current) playMediumHaptic();
    onDragEnd(value);
  }, [dragY, onDragEnd]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      hasMovedRef.current = false;
      latestDragY.current = 0;
      lastIndexRef.current = index;
      lastIndexHapticAtRef.current = 0;
      playLightHaptic();
      onDragStart();
    },
    onPanResponderMove: (_, gesture) => {
      const nextY = Math.max(-FIELD_ROW_HEIGHT * 4, Math.min(FIELD_ROW_HEIGHT * 4, gesture.dy));
      if (Math.abs(nextY) > 3) hasMovedRef.current = true;
      latestDragY.current = nextY;
      dragY.setValue(nextY);
      const projectedIndex = Math.max(0, Math.min(itemCount - 1, index + Math.round(nextY / FIELD_ROW_HEIGHT)));
      const now = Date.now();
      if (projectedIndex !== lastIndexRef.current && now - lastIndexHapticAtRef.current > 90) {
        lastIndexRef.current = projectedIndex;
        lastIndexHapticAtRef.current = now;
        playSelectionHaptic();
      }
    },
    onPanResponderRelease: () => finishDrag(hasMovedRef.current ? latestDragY.current : 0),
    onPanResponderTerminate: () => finishDrag(hasMovedRef.current ? latestDragY.current : 0)
  }), [dragY, finishDrag, index, itemCount, onDragStart]);

  return (
    <Animated.View
      style={[
        styles.fieldRow,
        dragging && styles.fieldRowDragging,
        { transform: [{ translateY: dragY }] }
      ]}
    >
      <View style={styles.fieldRowPressArea}>
        <View style={[styles.fieldSwatch, { backgroundColor: field.color }]} />
        <Text style={styles.fieldName}>{field.name}</Text>
      </View>
      <Text style={styles.fieldCount}>{count}개</Text>
      <Pressable onPress={onEdit} hitSlop={8}><Text style={styles.more}>수정</Text></Pressable>
      <Pressable onPress={onDelete} hitSlop={8}><Text style={styles.deleteText}>삭제</Text></Pressable>
      <View {...panResponder.panHandlers} style={styles.dragHandleTouch}>
        <Text style={styles.dragHandle}>☰</Text>
      </View>
    </Animated.View>
  );
}

function FieldSheet({ visible, field, onClose, onSubmit }) {
  const fieldScrollRef = useRef(null);
  const fieldInputFocusedRef = useRef(false);
  const sheetDrag = useBottomSheetDrag(onClose, visible);
  const [name, setName] = useState("");
  const [color, setColor] = useState(fieldColors[0]);

  useEffect(() => {
    if (!visible) return;
    setName(field?.name || "");
    setColor(field?.color || fieldColors[0]);
  }, [visible, field]);

  const scrollToInput = useCallback((delay = 260) => {
    setTimeout(() => {
      fieldScrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(showEvent, () => {
      if (fieldInputFocusedRef.current) scrollToInput(80);
    });
    return () => {
      fieldInputFocusedRef.current = false;
      subscription.remove();
    };
  }, [visible, scrollToInput]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fieldSheet}>
            <SheetHandle panHandlers={sheetDrag.panHandlers} />
            <ScrollView
              ref={fieldScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.fieldSheetScrollContent}
            >
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>{field ? "분야 수정" : "분야 추가"}</Text>
                <CircleButton text="×" onPress={onClose} />
              </View>
              <Input
                label="분야 이름 *"
                value={name}
                onChangeText={setName}
                placeholder="예: 독서, 여행..."
                onFocus={() => {
                  fieldInputFocusedRef.current = true;
                  scrollToInput(260);
                  scrollToInput(520);
                }}
                onBlur={() => {
                  fieldInputFocusedRef.current = false;
                }}
              />
              <FieldLabel label="색상 *" />
              <View style={styles.colorGrid}>
                {fieldColors.map((item) => <Pressable key={item} style={[styles.colorDot, { backgroundColor: item }, color === item && styles.colorSelected]} onPress={() => setColor(item)} />)}
              </View>
              <PrimaryButton label={field ? "수정하기" : "추가하기"} disabled={!name.trim()} onPress={() => onSubmit({ id: field?.id, name: name.trim(), color })} />
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function QuickFieldSheet({ onClose, onSubmit }) {
  const fieldScrollRef = useRef(null);
  const fieldInputFocusedRef = useRef(false);
  const sheetDrag = useBottomSheetDrag(onClose, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState(fieldColors[0]);
  const [saving, setSaving] = useState(false);

  const scrollToInput = useCallback((delay = 260) => {
    setTimeout(() => {
      fieldScrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscription = Keyboard.addListener(showEvent, () => {
      if (fieldInputFocusedRef.current) scrollToInput(80);
    });
    return () => {
      fieldInputFocusedRef.current = false;
      subscription.remove();
    };
  }, [scrollToInput]);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit?.({ name: name.trim(), color });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.timeInlineOverlay}>
      <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fieldSheet}>
          <SheetHandle panHandlers={sheetDrag.panHandlers} />
          <ScrollView
            ref={fieldScrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.fieldSheetScrollContent}
          >
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>분야 추가</Text>
              <CircleButton text="×" onPress={onClose} />
            </View>
            <Input
              label="분야 이름 *"
              value={name}
              onChangeText={setName}
              placeholder="예: 독서, 여행..."
              onFocus={() => {
                fieldInputFocusedRef.current = true;
                scrollToInput(260);
                scrollToInput(520);
              }}
              onBlur={() => {
                fieldInputFocusedRef.current = false;
              }}
            />
            <FieldLabel label="색상 *" />
            <View style={styles.colorGrid}>
              {fieldColors.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.colorDot, { backgroundColor: item }, color === item && styles.colorSelected]}
                  onPress={() => setColor(item)}
                />
              ))}
            </View>
            <PrimaryButton label={saving ? "저장 중..." : "추가하기"} disabled={!name.trim() || saving} onPress={submit} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

function PrioritySection({ priority, tasks, fields, onOpenTask, onToggleTask }) {
  return (
    <View>
      <View style={styles.priorityHeader}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColors[priority] }]} />
        <Text style={[styles.priorityTitle, { color: priorityColors[priority] }]}>{priority}순위</Text>
        <Text style={styles.priorityDesc}>{priorityCopy[priority]}</Text>
        <Text style={styles.priorityCount}>{tasks.filter((task) => task.done).length}/{tasks.length || 1}</Text>
      </View>
      {tasks.length === 0 && <Text style={styles.emptyText}>할 일이 없어요</Text>}
      {tasks.map((task) => <TaskCard key={task.id} task={task} field={fields.find((field) => field.id === task.fieldId)} onOpenTask={onOpenTask} onToggleTask={onToggleTask} />)}
    </View>
  );
}

function TaskCard({ task, field, onOpenTask, onToggleTask }) {
  const timeLabel = formatTaskTime(task);
  const reminderLabel = formatReminder(task);
  const reminderNoneLabel = "\uC54C\uB9BC \uC5C6\uC74C";
  return (
    <Pressable style={styles.taskCard} onPress={() => onOpenTask(task.id)}>
      <Pressable style={[styles.check, task.done && styles.checkDone]} onPress={() => onToggleTask(task.id, !task.done)}>
        <Text style={styles.checkText}>{task.done ? "\u2713" : ""}</Text>
      </Pressable>
      <View style={styles.taskMid}>
        <Text numberOfLines={2} style={[styles.taskTitle, task.done && styles.doneTitle]}>{task.title}</Text>
        <View style={styles.metaRow}>
          {!!task.memo && <Text style={styles.meta}>{"\uBA54\uBAA8"}</Text>}
          <Text style={[styles.priorityTag, { backgroundColor: `${priorityColors[task.priority]}20`, color: priorityColors[task.priority] }]}>{task.priority}{"\uC21C\uC704"}</Text>
          <Text style={[styles.fieldTag, { backgroundColor: `${field?.color || BLUE}22`, color: field?.color || BLUE }]}>{field?.name || "\uBBF8\uC9C0\uC815"}</Text>
          {!!timeLabel && <Text style={styles.timeTag}>{timeLabel}</Text>}
          {reminderLabel !== reminderNoneLabel && <Text style={styles.meta}>{"\uC54C\uB9BC"} {reminderLabel}</Text>}
        </View>
      </View>
      <Text style={styles.more}>...</Text>
    </Pressable>
  );
}

function Input({ label, ...props }) {
  const required = label.trim().endsWith("*");
  const cleanLabel = required ? label.replace(/\s*\*$/, "") : label;
  const handleFocus = (event) => {
    props.onFocus?.(event);
    if (props.multiline) activeMultilineFocusHandler?.();
  };
  const handleBlur = (event) => {
    props.onBlur?.(event);
    if (props.multiline) activeMultilineBlurHandler?.();
  };
  return (
    <View style={styles.inputWrap}>
      <FieldLabel label={cleanLabel} required={required} />
      <TextInput
        style={[styles.input, props.multiline && styles.textArea]}
        placeholderTextColor="#c2cada"
        {...props}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </View>
  );
}

function OptionalInput({ label, value, setValue, placeholder, multiline }) {
  return <Input label={`${label}  선택`} value={value} onChangeText={setValue} placeholder={placeholder} multiline={multiline} />;
}

function FieldLabel({ label, required }) {
  const cleanLabel = required || label.trim().endsWith("*") ? label.replace(/\s*\*$/, "") : label;
  const isRequired = required || label.trim().endsWith("*");
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, isRequired && styles.requiredLabel]}>{cleanLabel}</Text>
      {isRequired && <Text style={styles.requiredStar}>*</Text>}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }) {
  return <Pressable style={[styles.primary, disabled && styles.primaryDisabled]} onPress={onPress} disabled={disabled}><Text style={styles.primaryText}>{label}</Text></Pressable>;
}

function SocialButton({ icon, label, bg, fg, onPress, disabled }) {
  return <Pressable disabled={disabled} style={[styles.socialButton, { backgroundColor: bg }, disabled && styles.socialButtonDisabled]} onPress={onPress}><Text style={[styles.socialIcon, { color: fg }]}>{icon}</Text><Text style={[styles.socialText, { color: fg }]}>{label}</Text></Pressable>;
}

function Divider({ label }) {
  return <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>{label}</Text><View style={styles.line} /></View>;
}

function ModeSwitch({ value, onChange }) {
  return (
    <View style={styles.modeSwitch}>
      <Pressable style={[styles.modeItem, value === "month" && styles.modeActive]} onPress={() => onChange("month")}><Text style={styles.modeText}>월</Text></Pressable>
      <Pressable style={[styles.modeItem, value === "week" && styles.modeActive]} onPress={() => onChange("week")}><Text style={styles.modeText}>주</Text></Pressable>
    </View>
  );
}

function CircleButton({ text, onPress }) {
  return <Pressable style={styles.circle} onPress={onPress}><Text style={styles.circleText}>{text}</Text></Pressable>;
}

function TopBar({ title, onBack }) {
  return <View style={styles.topBar}><CircleButton text="‹" onPress={onBack} /><Text style={styles.topTitle}>{title}</Text><View style={styles.topSpacer} /></View>;
}

function useBottomSheetDrag(onClose, visible = true) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    translateY.setValue(0);
  }, [visible, translateY]);

  const snapBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4
    }).start();
  }, [translateY]);

  const closeByDrag = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    Animated.timing(translateY, {
      toValue: 520,
      duration: 210,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(({ finished }) => {
      translateY.setValue(0);
      closingRef.current = false;
      if (finished) onClose?.();
    });
  }, [onClose, translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => {
      const nextY = Math.max(-46, Math.min(520, gesture.dy));
      translateY.setValue(nextY);
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 120 || gesture.vy > 1.1) {
        closeByDrag();
        return;
      }
      snapBack();
    },
    onPanResponderTerminate: snapBack
  }), [closeByDrag, snapBack, translateY]);

  return { translateY, panHandlers: panResponder.panHandlers };
}

function SheetHandle({ panHandlers }) {
  return (
    <View {...(panHandlers || {})} style={styles.handleTouch}>
      <View style={styles.handle} />
    </View>
  );
}

function StepperBox({ text, onLeft, onRight }) {
  return <View style={styles.stepper}><Pressable onPress={onLeft}><Text style={styles.stepperArrow}>‹</Text></Pressable><Text style={styles.stepperText}>{text}</Text><Pressable onPress={onRight}><Text style={styles.stepperArrow}>›</Text></Pressable></View>;
}

function CompactTimeRow({ label, date, time, isAllDay, onPressDate, onPressTime }) {
  return (
    <View style={styles.compactTimeRow}>
      <Text style={styles.compactTimeLabel}>{label}</Text>
      <Pressable style={styles.compactDateButton} onPress={onPressDate}>
        <Text style={styles.compactDateText}>{compactDate(date)}</Text>
      </Pressable>
      <Pressable
        style={[styles.compactTimeButton, isAllDay && styles.compactTimeButtonDisabled]}
        onPress={onPressTime}
        disabled={isAllDay}
      >
        <Text style={[styles.compactTimeText, isAllDay && styles.compactTimeTextDisabled]}>
          {isAllDay ? "종일" : formatClock(time)}
        </Text>
        {!isAllDay && <Text style={styles.compactTimeChevron}>›</Text>}
      </Pressable>
    </View>
  );
}

function TimePickerButton({ label, value, onPress }) {
  return (
    <Pressable style={styles.timeSettingRow} onPress={onPress}>
      <View>
        <Text style={styles.timeSettingLabel}>{label}</Text>
        <Text style={styles.timeSettingValue}>{formatClock(value)}</Text>
      </View>
      <Text style={styles.timeSettingChevron}>›</Text>
    </Pressable>
  );
}

function DatePickerButton({ label, value, onPress }) {
  return (
    <Pressable style={styles.timeSettingRow} onPress={onPress}>
      <View>
        <Text style={styles.timeSettingLabel}>{label}</Text>
        <Text style={styles.timeSettingValue}>{prettyDate(value)}</Text>
      </View>
      <Text style={styles.timeSettingChevron}>›</Text>
    </Pressable>
  );
}

function DatePickerModal({ visible, title, value, onCancel, onConfirm }) {
  const sheetDrag = useBottomSheetDrag(onCancel, visible);
  const [draftDate, setDraftDate] = useState(value || todayKey());

  useEffect(() => {
    if (visible) setDraftDate(value || todayKey());
  }, [visible, value]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.timeModalBackdrop}>
        <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
        <View style={styles.dateModalSheet}>
          <SheetHandle panHandlers={sheetDrag.panHandlers} />
          <View style={styles.timeModalHeader}>
            <Pressable style={styles.timeModalCancel} onPress={onCancel}><Text style={styles.timeModalCancelText}>취소</Text></Pressable>
            <Text style={styles.timeModalTitle}>{title}</Text>
            <Pressable style={styles.timeModalDone} onPress={() => onConfirm(draftDate)}><Text style={styles.timeModalDoneText}>완료</Text></Pressable>
          </View>
          <View style={styles.datePickerCard}>
            <Text style={styles.datePickerValue}>{prettyDate(draftDate)}</Text>
            <View style={styles.datePickerControls}>
              <Pressable style={styles.datePickerButton} onPress={() => setDraftDate(shiftDate(draftDate, -7))}><Text style={styles.datePickerButtonText}>-7일</Text></Pressable>
              <Pressable style={styles.datePickerButton} onPress={() => setDraftDate(shiftDate(draftDate, -1))}><Text style={styles.datePickerButtonText}>-1일</Text></Pressable>
              <Pressable style={styles.datePickerButton} onPress={() => setDraftDate(shiftDate(draftDate, 1))}><Text style={styles.datePickerButtonText}>+1일</Text></Pressable>
              <Pressable style={styles.datePickerButton} onPress={() => setDraftDate(shiftDate(draftDate, 7))}><Text style={styles.datePickerButtonText}>+7일</Text></Pressable>
            </View>
          </View>
        </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TimePickerInlineOverlay({ title, value, onCancel, onConfirm }) {
  const sheetDrag = useBottomSheetDrag(onCancel, true);
  return (
    <View style={styles.timeInlineOverlay}>
      <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
        <TimePickerContent title={title} value={value} onCancel={onCancel} onConfirm={onConfirm} panHandlers={sheetDrag.panHandlers} />
      </Animated.View>
    </View>
  );
}

function TimePickerModal({ visible, title, value, onCancel, onConfirm }) {
  const sheetDrag = useBottomSheetDrag(onCancel, visible);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.timeModalBackdrop}>
        <Animated.View style={[styles.sheetAnimatedWrap, { transform: [{ translateY: sheetDrag.translateY }] }]}>
          <TimePickerContent title={title} value={value} onCancel={onCancel} onConfirm={onConfirm} panHandlers={sheetDrag.panHandlers} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function WheelColumn({ values, value, onChange, format = (item) => item, repeat = true }) {
  const scrollRef = useRef(null);
  const selectedValueRef = useRef(value);
  const repeatedValues = useMemo(() => repeat ? Array.from({ length: WHEEL_REPEAT_COUNT }).flatMap(() => values) : values, [repeat, values]);
  const middleStart = repeat ? Math.floor(WHEEL_REPEAT_COUNT / 2) * values.length : 0;
  const valueIndex = Math.max(0, values.findIndex((item) => item === value));
  const initialIndex = middleStart + valueIndex;
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    selectedValueRef.current = value;
    const nextValueIndex = Math.max(0, values.findIndex((item) => item === value));
    const nextIndex = middleStart + nextValueIndex;
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: nextIndex * WHEEL_ITEM_HEIGHT, animated: false });
    });
  }, [middleStart, value, values]);

  const commitValue = (nextValue) => {
    if (selectedValueRef.current === nextValue) return;
    selectedValueRef.current = nextValue;
    onChange(nextValue);
    playSelectionHaptic();
  };

  const snapToNearest = (offsetY) => {
    const rawIndex = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    const maxIndex = repeatedValues.length - 1;
    const nextIndex = Math.max(0, Math.min(maxIndex, rawIndex));
    setActiveIndex(nextIndex);
    commitValue(repeatedValues[nextIndex]);

    if (repeat && (nextIndex < values.length * 2 || nextIndex > values.length * (WHEEL_REPEAT_COUNT - 2))) {
      const resetIndex = middleStart + values.findIndex((item) => item === repeatedValues[nextIndex]);
      requestAnimationFrame(() => {
        setActiveIndex(resetIndex);
        scrollRef.current?.scrollTo({ y: resetIndex * WHEEL_ITEM_HEIGHT, animated: false });
      });
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={styles.wheelScrollContent}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_HEIGHT}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={(event) => {
        const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
        if (index !== activeIndex && repeatedValues[index] != null) setActiveIndex(index);
      }}
      onMomentumScrollEnd={(event) => snapToNearest(event.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(event) => snapToNearest(event.nativeEvent.contentOffset.y)}
    >
      {repeatedValues.map((item, index) => {
        const distance = Math.abs(index - activeIndex);
        return (
          <Pressable key={`${item}-${index}`} style={styles.wheelItem} onPress={() => {
            setActiveIndex(index);
            commitValue(item);
            scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: true });
          }}>
            <Text style={[styles.wheelText, index === activeIndex && styles.wheelTextSelected, distance > 1 && styles.wheelTextFar]}>{format(item)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function TimePickerContent({ title, value, onCancel, onConfirm, panHandlers }) {
  const initial = parseTimeParts(value);
  const [period, setPeriod] = useState(initial.period);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    const next = parseTimeParts(value);
    setPeriod(next.period);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  const periodValues = useMemo(() => ["AM", "PM"], []);
  const hourValues = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const minuteValues = useMemo(() => Array.from({ length: 60 }, (_, index) => index), []);

  return (
    <View style={styles.timeModalSheet}>
      <SheetHandle panHandlers={panHandlers} />
      <View style={styles.timeModalHeader}>
        <Pressable style={styles.timeModalCancel} onPress={onCancel}><Text style={styles.timeModalCancelText}>취소</Text></Pressable>
        <Text style={styles.timeModalTitle}>{title}</Text>
        <Pressable style={styles.timeModalDone} onPress={() => onConfirm(buildTime(period, hour, minute))}><Text style={styles.timeModalDoneText}>완료</Text></Pressable>
      </View>
      <View style={styles.wheelPicker}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <WheelColumn values={periodValues} value={period} onChange={setPeriod} format={(item) => item === "AM" ? "오전" : "오후"} repeat={false} />
        <WheelColumn values={hourValues} value={hour} onChange={setHour} />
        <WheelColumn values={minuteValues} value={minute} onChange={setMinute} format={pad} />
      </View>
      <Text style={styles.timeModalPreview}>{formatClock(buildTime(period, hour, minute))}</Text>
    </View>
  );
}

function Chip({ field, active, onPress }) {
  return <Pressable style={[styles.chip, { borderColor: field.color, backgroundColor: active ? field.color : `${field.color}14` }]} onPress={onPress}><Text style={[styles.chipText, { color: active ? "#fff" : field.color }]}>{field.name}</Text></Pressable>;
}

function HelperText({ ok, text }) {
  return <Text style={[styles.helper, ok && styles.helperOk]}>{text}</Text>;
}

function DetailBox({ label, value, sub, dot, color, active, wide }) {
  return <View style={[styles.detailBox, active && { borderColor: color || BLUE }, active && styles.detailBoxActive, wide && styles.detailBoxWide]}><Text style={styles.detailLabel}>{label}</Text><Text style={[styles.detailValue, (dot || color) && { color: dot || color }]}>{dot ? "● " : ""}{value}</Text>{!!sub && <Text style={styles.detailSub}>{sub}</Text>}</View>;
}

function MenuGroup({ children }) {
  return <View style={styles.menuGroup}>{children}</View>;
}

function MenuItem({ icon, label, right, onPress }) {
  return <Pressable style={styles.menuItem} onPress={onPress}><Text style={styles.menuIcon}>{icon}</Text><Text style={styles.menuLeft}>{label}</Text><Text style={styles.menuRight}>{right || "›"}</Text></Pressable>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: BG },
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },
  loginScreen: { flex: 1, backgroundColor: BG, paddingHorizontal: 30, paddingTop: 70, paddingBottom: 34 },
  loginTop: { alignItems: "center", marginBottom: 36 },
  appIcon: { width: 84, height: 84, borderRadius: 25, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", shadowColor: BLUE, shadowOpacity: 0.25, shadowRadius: 30, shadowOffset: { width: 0, height: 18 } },
  appIconText: { color: "#fff", fontSize: 35, fontWeight: "900" },
  brand: { marginTop: 26, fontSize: 38, color: BLUE, fontWeight: "900", letterSpacing: 0 },
  sub: { marginTop: 10, color: MUTED, fontSize: 16, fontWeight: "700" },
  socials: { gap: 14 },
  socialButton: { height: 62, borderRadius: 18, borderWidth: 1, borderColor: "#dbe1eb", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  socialButtonDisabled: { opacity: 0.55 },
  socialIcon: { fontSize: 19, fontWeight: "900" },
  socialText: { fontSize: 17, fontWeight: "900" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  line: { flex: 1, height: 1, backgroundColor: LINE },
  dividerText: { marginHorizontal: 14, color: MUTED, fontWeight: "800" },
  inputWrap: { marginBottom: 14 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  label: { color: "#596680", fontSize: 14, fontWeight: "800" },
  requiredLabel: { color: "#3f4b66", fontWeight: "900" },
  requiredStar: { color: priorityColors[1], fontSize: 14, fontWeight: "900", marginLeft: 3 },
  input: { minHeight: 56, borderRadius: 16, backgroundColor: "#eaf0f8", paddingHorizontal: 18, color: INK, fontSize: 16, fontWeight: "700" },
  textArea: { minHeight: 92, paddingTop: 18, textAlignVertical: "top" },
  authError: { color: "#f04444", fontSize: 13, fontWeight: "800", marginTop: -4, marginBottom: 12 },
  primary: { height: 60, borderRadius: 19, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", marginTop: 12 },
  primaryDisabled: { backgroundColor: "#b8c3ec" },
  primaryText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  signupBox: { marginTop: 26, minHeight: 88, borderRadius: 20, backgroundColor: "#edf2fa", padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  signupTitle: { color: INK, fontSize: 16, fontWeight: "900" },
  signupSub: { color: MUTED, marginTop: 7, fontWeight: "700" },
  whitePill: { backgroundColor: "#fff", borderRadius: 15, paddingVertical: 13, paddingHorizontal: 20 },
  whitePillText: { color: INK, fontWeight: "900" },
  helper: { marginTop: -8, marginBottom: 12, color: MUTED, fontSize: 13, fontWeight: "700" },
  helperOk: { color: BLUE },
  mainHeader: { paddingTop: 8, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  mainLogo: { flex: 1, fontSize: 28, fontWeight: "900", color: BLUE, letterSpacing: 0 },
  modeSwitch: { flexDirection: "row", backgroundColor: "#eaf0f8", borderRadius: 17, padding: 5 },
  modeItem: { height: 38, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  modeActive: { backgroundColor: "#fff", shadowColor: "#8190aa", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  modeText: { color: INK, fontWeight: "900" },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eaf0f8", alignItems: "center", justifyContent: "center" },
  circleText: { color: "#8490aa", fontSize: 23, fontWeight: "900" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  navArrow: { fontSize: 28, color: "#8290ad", fontWeight: "400" },
  monthTitle: { fontSize: 19, color: INK, fontWeight: "900" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: "center", color: "#8490aa", fontSize: 13, fontWeight: "900" },
  sun: { color: "#ff4f5e" },
  sat: { color: "#2f7cff" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  weekCell: { height: 62 },
  selectedDay: { backgroundColor: BLUE },
  dayNum: { color: INK, fontSize: 15, fontWeight: "900" },
  selectedDayText: { color: "#fff" },
  faded: { color: "#c0c7d5" },
  dots: { height: 7, flexDirection: "row", gap: 3, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#335be6" },
  selectedDot: { borderWidth: 0.5, borderColor: "rgba(255,255,255,0.75)" },
  dividerLine: { height: 1, backgroundColor: LINE, marginTop: 10 },
  listContent: { paddingBottom: 112 },
  daySummary: { marginTop: 16, flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  dayTitle: { color: INK, fontSize: 22, fontWeight: "900" },
  dayDate: { color: MUTED, fontSize: 14, fontWeight: "800" },
  completeText: { marginLeft: "auto", color: BLUE, fontWeight: "900" },
  priorityHeader: { flexDirection: "row", alignItems: "center", marginTop: 18, marginBottom: 10 },
  priorityDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE, marginRight: 9 },
  priorityTitle: { color: INK, fontSize: 16, fontWeight: "900", marginRight: 9 },
  priorityDesc: { color: MUTED, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  priorityCount: { marginLeft: "auto", color: MUTED, fontWeight: "800" },
  emptyText: { color: MUTED, fontWeight: "700", paddingVertical: 8 },
  taskCard: { minHeight: 82, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, flexDirection: "row", alignItems: "flex-start", padding: 14, marginBottom: 12 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#cbd4e4", alignItems: "center", justifyContent: "center", marginRight: 14 },
  checkDone: { backgroundColor: BLUE, borderColor: BLUE },
  checkText: { color: "#fff", fontWeight: "900" },
  taskMid: { flex: 1 },
  taskTitle: { color: INK, fontSize: 16, fontWeight: "900" },
  doneTitle: { color: MUTED, textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 },
  meta: { color: MUTED, fontSize: 12, fontWeight: "800" },
  priorityTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 12, fontWeight: "900" },
  fieldTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 12, fontWeight: "900" },
  timeTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "#eef3ff", color: "#6476c8", fontSize: 12, fontWeight: "900" },
  more: { color: "#a8b2c5", fontSize: 22, lineHeight: 24, fontWeight: "900" },
  fab: { position: "absolute", right: 26, bottom: 28, width: 66, height: 66, borderRadius: 23, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", shadowColor: BLUE, shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  fabText: { color: "#fff", fontSize: 43, lineHeight: 48, fontWeight: "300" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.38)" },
  sheetAnimatedWrap: { width: "100%" },
  sheet: { maxHeight: "88%", backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28 },
  sheetScrollContent: { paddingBottom: Platform.OS === "ios" ? 28 : 88 },
  fieldSheet: { maxHeight: "88%", backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34 },
  fieldSheetScrollContent: { paddingBottom: Platform.OS === "ios" ? 28 : 88 },
  handleTouch: { alignSelf: "stretch", alignItems: "center", paddingTop: 8, marginTop: -8 },
  handle: { alignSelf: "center", width: 45, height: 5, borderRadius: 3, backgroundColor: "#e1e5ec", marginBottom: 18 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sheetTitle: { color: INK, fontSize: 24, fontWeight: "900" },
  stepper: { height: 60, borderRadius: 16, backgroundColor: "#eaf0f8", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, marginBottom: 24 },
  stepperText: { color: INK, fontSize: 16, fontWeight: "900" },
  stepperArrow: { color: "#8290ad", fontSize: 28 },
  chips: { gap: 10, paddingBottom: 18 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 17, paddingVertical: 10 },
  chipText: { fontWeight: "900" },
  addChip: { borderRadius: 18, paddingHorizontal: 17, paddingVertical: 10, backgroundColor: "#eaf0f8" },
  addChipText: { color: MUTED, fontWeight: "900" },
  scrollHintTrack: { height: 4, borderRadius: 2, backgroundColor: "#edf1f8", marginTop: -8, marginBottom: 16, overflow: "hidden" },
  scrollHintThumb: { height: 4, borderRadius: 2, backgroundColor: "#b9c4db" },
  priorityPills: { flexDirection: "row", gap: 10 },
  priorityPill: { flex: 1, height: 52, borderRadius: 15, backgroundColor: "#f0f2f7", borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  priorityPillActive: { borderWidth: 2, borderColor: BLUE, backgroundColor: "#fff" },
  priorityPillText: { color: "#9ba4b8", fontSize: 16, fontWeight: "900" },
  priorityPillTextActive: { color: BLUE },
  priorityHint: { color: "#b0b8c8", textAlign: "center", fontWeight: "800", marginVertical: 18 },
  optionalButton: { height: 52, borderRadius: 16, backgroundColor: "#eaf0f8", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  optionalButtonText: { color: "#71809d", fontWeight: "900", fontSize: 15 },
  optionPanel: { borderRadius: 18, backgroundColor: "#edf3fb", borderWidth: 1, borderColor: "#e3eaf5", padding: 10, marginBottom: 14 },
  switchLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  optionTitle: { color: INK, fontWeight: "900", fontSize: 16 },
  clearOptionButton: { alignSelf: "flex-end", paddingTop: 8, paddingBottom: 2, paddingHorizontal: 10 },
  clearOptionText: { color: "#f04444", fontWeight: "900" },
  timeAllDayRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#dfe7f3", marginBottom: 6 },
  timeAllDayText: { color: INK, fontSize: 15, fontWeight: "900" },
  compactTimeRow: { minHeight: 54, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#dfe7f3", gap: 8 },
  compactTimeLabel: { width: 42, color: MUTED, fontSize: 14, fontWeight: "900" },
  compactDateButton: { flex: 1.1, minHeight: 38, borderRadius: 14, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  compactDateText: { color: INK, fontSize: 14, fontWeight: "900" },
  compactTimeButton: { flex: 1, minHeight: 38, borderRadius: 14, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  compactTimeButtonDisabled: { backgroundColor: "#f5f7fb" },
  compactTimeText: { color: INK, fontSize: 14, fontWeight: "900" },
  compactTimeTextDisabled: { color: "#9da8bd" },
  compactTimeChevron: { color: "#8f9bb4", fontSize: 19, fontWeight: "900", marginLeft: 4 },
  timeSettingRow: { minHeight: 68, borderRadius: 18, backgroundColor: "#f8fbff", paddingHorizontal: 16, paddingVertical: 13, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeSettingLabel: { color: MUTED, fontSize: 13, fontWeight: "900", marginBottom: 5 },
  timeSettingValue: { color: INK, fontSize: 16, fontWeight: "900" },
  timeSettingChevron: { color: "#9aa7bd", fontSize: 26, fontWeight: "900" },
  timeInlineOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end", backgroundColor: "rgba(7,18,47,0.24)" },
  timeModalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7,18,47,0.24)" },
  timeModalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
  dateModalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
  timeModalHeader: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  timeModalCancel: { minWidth: 64, height: 38, alignItems: "flex-start", justifyContent: "center" },
  timeModalCancelText: { color: MUTED, fontSize: 16, fontWeight: "900" },
  timeModalTitle: { color: INK, fontSize: 18, fontWeight: "900" },
  timeModalDone: { minWidth: 64, height: 38, alignItems: "flex-end", justifyContent: "center" },
  timeModalDoneText: { color: BLUE, fontSize: 16, fontWeight: "900" },
  wheelPicker: { height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS, borderRadius: 22, backgroundColor: "#f6f8fc", flexDirection: "row", overflow: "hidden", position: "relative", paddingHorizontal: 12 },
  wheelHighlight: { position: "absolute", left: 12, right: 12, top: WHEEL_ITEM_HEIGHT * 2, height: WHEEL_ITEM_HEIGHT, borderRadius: 16, backgroundColor: "#e8eefb" },
  wheelColumn: { flex: 1, height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS },
  wheelScrollContent: { paddingVertical: WHEEL_ITEM_HEIGHT * 2 },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelText: { color: "#a5afc2", fontSize: 18, fontWeight: "800", opacity: 0.42 },
  wheelTextSelected: { color: INK, fontSize: 23, fontWeight: "900", opacity: 1 },
  wheelTextFar: { opacity: 0.22 },
  wheelTextBlank: { opacity: 0 },
  timeModalPreview: { marginTop: 14, color: BLUE, fontSize: 16, fontWeight: "900", textAlign: "center" },
  datePickerCard: { borderRadius: 22, backgroundColor: "#f6f8fc", padding: 18, alignItems: "center" },
  datePickerValue: { color: INK, fontSize: 22, fontWeight: "900", marginBottom: 18 },
  datePickerControls: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  datePickerButton: { minHeight: 42, borderRadius: 14, backgroundColor: "#e8eefb", paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  datePickerButtonText: { color: "#61708d", fontWeight: "900" },
  reminderGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  reminderChip: { borderRadius: 16, backgroundColor: "#f0f2f7", borderWidth: 1, borderColor: "transparent", paddingVertical: 10, paddingHorizontal: 13 },
  reminderChipActive: { backgroundColor: "#eef2ff", borderColor: BLUE },
  reminderChipDisabled: { opacity: 0.45 },
  reminderChipText: { color: "#71809d", fontWeight: "900", fontSize: 13 },
  reminderChipTextActive: { color: BLUE },
  reminderChipTextDisabled: { color: "#a9b2c5" },
  optionHelp: { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 14 },
  detailModalRoot: { flex: 1, justifyContent: "flex-end" },
  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)" },
  detailSheet: { maxHeight: "80%", backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 },
  sheetDragArea: { paddingBottom: 4 },
  detailScroll: { paddingBottom: 24 },
  detailActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  actionGroup: { flexDirection: "row", gap: 10, alignItems: "center" },
  statusPill: { borderRadius: 16, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: "#eef3fb" },
  statusText: { color: MUTED, fontWeight: "900" },
  actionPill: { borderRadius: 16, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: "#f3f5fb" },
  actionText: { color: INK, fontWeight: "900" },
  deletePill: { borderRadius: 16, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: "#fff0f0", borderWidth: 1, borderColor: "#ffd3d3" },
  deleteText: { color: "#f04444", fontWeight: "900" },
  detailTitle: { color: INK, fontSize: 24, fontWeight: "900", marginBottom: 20 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailBox: { width: "48%", minHeight: 102, borderRadius: 16, backgroundColor: "#eaf0f8", padding: 16, marginBottom: 12 },
  detailBoxActive: { borderWidth: 2, borderColor: BLUE, backgroundColor: "#f4f7ff" },
  detailBoxWide: { width: "100%" },
  detailLabel: { color: MUTED, fontSize: 13, fontWeight: "900", marginBottom: 10 },
  detailValue: { color: INK, fontSize: 16, fontWeight: "900" },
  detailSub: { color: MUTED, marginTop: 8, fontWeight: "800" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 20 },
  colorDot: { width: 46, height: 46, borderRadius: 23 },
  colorSelected: { borderWidth: 4, borderColor: "#1f2a44" },
  topBar: { height: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { color: INK, fontSize: 22, fontWeight: "900" },
  topSpacer: { width: 44 },
  settingsScroll: { paddingBottom: 36 },
  fieldsScroll: { paddingTop: 16, paddingBottom: 36 },
  tabStatsScroll: { paddingBottom: 120 },
  settingsSection: { color: MUTED, fontSize: 14, fontWeight: "900", marginTop: 18, marginBottom: 10 },
  accountCard: { minHeight: 120, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, flexDirection: "row", alignItems: "center", padding: 20, gap: 18 },
  avatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#d9fbff", borderWidth: 2, borderColor: "#91e7f0", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#12a9bd", fontSize: 26, fontWeight: "900" },
  accountName: { color: INK, fontSize: 19, fontWeight: "900" },
  accountEmail: { color: MUTED, marginTop: 7, fontWeight: "700" },
  loginType: { color: MUTED, marginTop: 8, fontWeight: "800" },
  menuGroup: { borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, overflow: "hidden" },
  menuItem: { minHeight: 70, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#eef1f6" },
  menuIcon: { color: "#8794b0", width: 36, fontWeight: "900" },
  menuLeft: { flex: 1, color: INK, fontSize: 17, fontWeight: "900" },
  menuRight: { color: MUTED, fontWeight: "900" },
  logoutText: { color: "#f04444", textAlign: "center", marginTop: 22, fontWeight: "900" },
  fieldRow: { height: 68, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, marginBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  fieldRowDragging: { opacity: 0.94, borderColor: "#c7d3ff", shadowColor: BLUE, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8, zIndex: 10 },
  fieldRowPressArea: { flex: 1, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12 },
  fieldSwatch: { width: 18, height: 18, borderRadius: 9 },
  fieldName: { flex: 1, color: INK, fontSize: 17, fontWeight: "900" },
  fieldCount: { color: MUTED, fontWeight: "800" },
  dragHandleTouch: { minWidth: 34, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dragHandle: { color: "#b6bfd0", fontSize: 20, fontWeight: "900", paddingLeft: 2 },
  rateCard: { borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, padding: 24, alignItems: "center" },
  rate: { color: BLUE, fontSize: 50, fontWeight: "900" },
  rateMsg: { color: MUTED, marginTop: 8, fontWeight: "800", textAlign: "center" },
  statRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  stat: { flex: 1, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, padding: 16, alignItems: "center" },
  statValue: { color: INK, fontSize: 25, fontWeight: "900" },
  statLabel: { color: MUTED, marginTop: 6, fontWeight: "800" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  progressName: { width: 68, color: INK, fontWeight: "900" },
  progressTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "#e4e9f2", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 5 },
  progressCount: { width: 42, color: MUTED, textAlign: "right", fontWeight: "800" }
});
