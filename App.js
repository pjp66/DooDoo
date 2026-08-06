import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
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
import { loadCategories, loadTasks, saveCategories, saveTasks } from "./src/repositories/taskRepository";

const BLUE = "#4f6ff0";
const BG = "#f4f7fc";
const INK = "#07122f";
const MUTED = "#8b97b4";
const LINE = "#e2e7f0";

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
const formatClock = (time) => {
  if (!time) return "";
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${pad(minute)}`;
};
const playSelectionHaptic = () => {
  Haptics.selectionAsync().catch(() => {});
};
const timeToMinutes = (time) => {
  const [hour, minute] = (time || "09:00").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 9) * 60 + (Number.isFinite(minute) ? minute : 0);
};
const minutesToTime = (minutes) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
};
const addMinutes = (time, minutes) => minutesToTime(timeToMinutes(time) + minutes);
const formatTaskTime = (task) => {
  if (task.isAllDay) return "종일";
  if (task.startDate && task.startTime && task.endDate && task.endTime) {
    const sameDate = task.startDate === task.endDate;
    const dateLabel = sameDate ? "" : `${prettyDate(task.startDate)} `;
    return `${dateLabel}${formatClock(task.startTime)} - ${sameDate ? "" : `${prettyDate(task.endDate)} `}${formatClock(task.endTime)}`;
  }
  if (task.startDate && task.startTime) return `${prettyDate(task.startDate)} ${formatClock(task.startTime)}`;
  return task.time || "";
};
const formatReminder = (task) => {
  if (task.reminderType === "custom") {
    return task.reminderTime ? `직접 설정 ${formatClock(task.reminderTime)}` : "직접 알림 시간 필요";
  }
  const option = reminderOptions.find((item) => item.type === task.reminderType);
  return option?.label || task.alarm || "알림 없음";
};
const hasStructuredTime = (task) => task.isAllDay || Boolean(task.startDate || task.startTime || task.endDate || task.endTime);

export default function App() {
  const [screen, setScreen] = useState("login");
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [fields, setFields] = useState(defaultFields);
  const [notifications, setNotifications] = useState(true);
  const [selectedDate, setSelectedDate] = useState("2026-08-06");
  const [calendarMode, setCalendarMode] = useState("month");
  const [taskSheetMode, setTaskSheetMode] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [fieldSheet, setFieldSheet] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    async function boot() {
      const [savedSession, savedUsers, savedTasks, savedFields, savedNotifications] = await Promise.all([
        loadStoredJson("session", null),
        loadStoredJson("users", []),
        loadTasks(),
        loadCategories(),
        loadStoredJson("notifications", true)
      ]);
      const nextFields = normalizeFields(savedFields?.length ? savedFields : defaultFields);
      setSession(savedSession);
      setUsers(savedUsers);
      setTasks(normalizeTasks(savedTasks || [], nextFields));
      setFields(nextFields);
      setNotifications(savedNotifications);
      setScreen(savedSession ? "main" : "login");
      setBooted(true);
    }
    boot();
  }, []);

  useEffect(() => {
    if (booted) saveTasks(tasks);
  }, [tasks, booted]);

  useEffect(() => {
    if (booted) saveCategories(fields);
  }, [fields, booted]);

  useEffect(() => {
    if (booted) saveStoredJson("notifications", notifications);
  }, [notifications, booted]);

  const selectedTask = tasks.find((task) => task.id === detailTaskId);

  const login = async ({ username, password }) => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("로그인", "아이디와 비밀번호를 입력해주세요.");
      return;
    }
    const found = users.find((user) => user.username === username.trim());
    if (users.length && (!found || found.password !== password)) {
      Alert.alert("로그인 실패", "계정 정보를 확인해주세요.");
      return;
    }
    const nextSession = {
      username: username.trim(),
      nickname: found?.nickname || username.trim(),
      email: found?.email || `${username.trim()}@doodoo.app`,
      loginType: "email"
    };
    setSession(nextSession);
    await saveStoredJson("session", nextSession);
    setScreen("main");
  };

  const signup = async ({ username, password, confirm, nickname }) => {
    if (!username.trim() || !password.trim() || !nickname.trim()) {
      Alert.alert("회원가입", "필수 정보를 모두 입력해주세요.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("회원가입", "비밀번호 확인이 일치하지 않아요.");
      return;
    }
    const nextUser = {
      username: username.trim(),
      password,
      nickname: nickname.trim(),
      email: `${username.trim()}@doodoo.app`
    };
    const nextUsers = [...users.filter((user) => user.username !== nextUser.username), nextUser];
    setUsers(nextUsers);
    await saveStoredJson("users", nextUsers);
    const nextSession = { ...nextUser, loginType: "email" };
    setSession(nextSession);
    await saveStoredJson("session", nextSession);
    setScreen("main");
  };

  const logout = () => {
    Alert.alert("로그아웃", "로그아웃하시겠습니까?", [
      { text: "취소" },
      {
        text: "로그아웃",
        onPress: async () => {
          await removeStoredItem("session");
          setSession(null);
          setScreen("login");
        }
      }
    ]);
  };

  const saveTask = (taskInput) => {
    const field = fields.find((item) => item.id === taskInput.fieldId);
    const now = new Date().toISOString();
    const nextTaskInput = {
      ...taskInput,
      category: field?.name || taskInput.category || "미지정",
      priorityLabel: priorityCopy[taskInput.priority],
      isCompleted: editingTask ? Boolean(editingTask.isCompleted ?? editingTask.done) : false
    };
    if (editingTask) {
      setTasks((prev) => prev.map((task) => (task.id === editingTask.id ? normalizeTaskRecord({ ...task, ...nextTaskInput, updatedAt: now }, fields) : task)));
      setDetailTaskId(editingTask.id);
      setSelectedDate(taskInput.date);
    } else {
      setTasks((prev) => [normalizeTaskRecord({ ...nextTaskInput, id: makeId("task"), done: false, isCompleted: false, createdAt: now, updatedAt: now }, fields), ...prev]);
      setSelectedDate(taskInput.date);
    }
    setEditingTask(null);
    setTaskSheetMode(null);
  };

  const toggleTask = (id, done) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, done, isCompleted: done, updatedAt: new Date().toISOString() } : task)));
  };

  const deleteTask = (id) => {
    Alert.alert("삭제", "이 할 일을 삭제하시겠습니까?", [
      { text: "취소" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          setTasks((prev) => prev.filter((task) => task.id !== id));
          setDetailTaskId(null);
        }
      }
    ]);
  };

  const upsertField = (fieldInput) => {
    if (fieldInput.id) {
      setFields((prev) => prev.map((field) => (field.id === fieldInput.id ? fieldInput : field)));
      setTasks((prev) => prev.map((task) => (
        task.fieldId === fieldInput.id
          ? { ...task, category: fieldInput.name, updatedAt: new Date().toISOString() }
          : task
      )));
    } else {
      setFields((prev) => [...prev, { ...fieldInput, id: makeId("field") }]);
    }
    setFieldSheet(null);
  };

  const deleteField = (fieldId) => {
    const used = tasks.some((task) => task.fieldId === fieldId);
    Alert.alert("분야 삭제", used ? "이 분야를 쓰는 할 일이 있어요. 삭제하면 해당 할 일의 분야가 미지정으로 바뀝니다." : "분야를 삭제할까요?", [
      { text: "취소" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          setFields((prev) => prev.filter((field) => field.id !== fieldId));
          setTasks((prev) => prev.map((task) => (task.fieldId === fieldId ? { ...task, fieldId: "", category: "미지정", updatedAt: new Date().toISOString() } : task)));
        }
      }
    ]);
  };

  const changeNotifications = (nextValue) => {
    if (!nextValue) {
      Alert.alert("알림 끄기", "알림을 끄시겠습니까? 실제 푸시 알림은 아직 연결하지 않았어요.", [
        { text: "취소" },
        { text: "끄기", onPress: () => setNotifications(false) }
      ]);
      return;
    }
    setNotifications(true);
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      {screen === "login" && <LoginScreen onLogin={login} onSignup={() => setScreen("signup")} />}
      {screen === "signup" && <SignupScreen onBack={() => setScreen("login")} onSignup={signup} />}
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
        onAddField={() => setFieldSheet({ mode: "add" })}
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
    isAllDay: Boolean(task.isAllDay),
    startDate: task.startDate || null,
    startTime: task.isAllDay ? null : task.startTime || null,
    endDate: task.endDate || null,
    endTime: task.isAllDay ? null : task.endTime || null,
    reminderType: task.reminderType || (task.alarm ? "custom" : "none"),
    reminderDate: task.reminderDate || null,
    reminderTime: task.reminderType === "custom" || task.reminderTime ? task.reminderTime || null : null,
    memo: task.memo || "",
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
  };
}

function normalizeTasks(items, fields = defaultFields) {
  return items.filter(Boolean).map((task) => normalizeTaskRecord(task, fields));
}

function normalizeFields(items) {
  const cleaned = items.filter((field) => field.id !== "health" && field.name !== "건강관리");
  const hasSchedule = cleaned.some((field) => field.id === "schedule");
  return hasSchedule ? cleaned : [...cleaned, { id: "schedule", name: "일정", color: "#16b8c9" }];
}

function LoginScreen({ onLogin, onSignup }) {
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
        <View style={styles.socials}>
          <SocialButton icon="G" label="Google로 계속하기" bg="#ffffff" fg={INK} onPress={() => Alert.alert("준비 중", "소셜 로그인은 나중에 연결할 예정이에요.")} />
          <SocialButton icon="K" label="카카오로 계속하기" bg="#ffdf00" fg="#231815" onPress={() => Alert.alert("준비 중", "카카오 로그인은 나중에 연결할 예정이에요.")} />
          <SocialButton icon="A" label="Apple로 계속하기" bg="#000000" fg="#ffffff" onPress={() => Alert.alert("준비 중", "Apple 로그인은 나중에 연결할 예정이에요.")} />
        </View>
        <Divider label="이메일로 로그인" />
        <Input label="아이디 *" value={username} onChangeText={setUsername} placeholder="아이디를 입력하세요" autoCapitalize="none" />
        <Input label="비밀번호 *" value={password} onChangeText={setPassword} placeholder="비밀번호를 입력하세요" secureTextEntry />
        <PrimaryButton label="로그인" onPress={() => onLogin({ username, password })} disabled={!username.trim() || !password.trim()} />
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

function SignupScreen({ onBack, onSignup }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nickname, setNickname] = useState("");
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <TopBar title="회원가입" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Input label="아이디 *" value={username} onChangeText={setUsername} placeholder="아이디를 입력하세요" autoCapitalize="none" />
        <HelperText ok={username.length >= 3} text="아이디가 3자 이상이면 사용 가능해요" />
        <Input label="비밀번호 *" value={password} onChangeText={setPassword} placeholder="비밀번호를 입력하세요" secureTextEntry />
        <HelperText ok={password.length >= 4} text="비밀번호가 4자 이상이면 사용 가능해요" />
        <Input label="비밀번호 확인 *" value={confirm} onChangeText={setConfirm} placeholder="비밀번호를 다시 입력하세요" secureTextEntry />
        <HelperText ok={!!confirm && password === confirm} text={confirm ? "일치해요" : "비밀번호 확인을 입력해주세요"} />
        <Input label={`닉네임 * ${nickname.length}/12`} value={nickname} onChangeText={(value) => setNickname(value.slice(0, 12))} placeholder="닉네임을 입력하세요" />
        <PrimaryButton label="회원가입" onPress={() => onSignup({ username, password, confirm, nickname })} />
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
            const count = tasks.filter((task) => task.date === key).length;
            const isSelected = key === selectedDate;
            const faded = mode === "month" && date.getMonth() !== selected.getMonth();
            return (
              <Pressable key={key} onPress={() => onSelect(key)} style={[styles.dayCell, mode === "week" && styles.weekCell, isSelected && styles.selectedDay]}>
                <Text style={[styles.dayNum, faded && styles.faded, date.getDay() === 0 && styles.sun, date.getDay() === 6 && styles.sat, isSelected && styles.selectedDayText]}>{date.getDate()}</Text>
                <View style={styles.dots}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, index) => <View key={index} style={[styles.dot, isSelected && styles.selectedDot]} />)}
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
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [fieldId, setFieldId] = useState(fields[0]?.id || "");
  const [priority, setPriority] = useState(null);
  const [hasTime, setHasTime] = useState(false);
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(selectedDate);
  const [endTime, setEndTime] = useState("10:00");
  const [reminderType, setReminderType] = useState("none");
  const [reminderDate, setReminderDate] = useState(selectedDate);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [memo, setMemo] = useState("");
  const [fieldScroll, setFieldScroll] = useState({ x: 0, content: 1, width: 1 });
  const [timePicker, setTimePicker] = useState(null);
  const [datePicker, setDatePicker] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const initialHasTime = Boolean(initialTask && hasStructuredTime(initialTask));
    setTitle(initialTask?.title || "");
    setDate(initialTask?.date || selectedDate);
    setFieldId(initialTask?.fieldId || fields[0]?.id || "");
    setPriority(initialTask?.priority || null);
    setHasTime(initialHasTime);
    setIsAllDay(Boolean(initialTask?.isAllDay));
    setStartDate(initialTask?.startDate || initialTask?.date || selectedDate);
    setStartTime(initialTask?.startTime || "09:00");
    setEndDate(initialTask?.endDate || initialTask?.date || selectedDate);
    setEndTime(initialTask?.endTime || "10:00");
    setReminderType(initialTask?.reminderType || "none");
    setReminderDate(initialTask?.reminderDate || initialTask?.date || selectedDate);
    setReminderTime(initialTask?.reminderTime || "09:00");
    setMemo(initialTask?.memo || "");
  }, [visible, initialTask, selectedDate, fields]);

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
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
          <SheetHandle />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{mode === "edit" ? "할 일 수정" : "할 일 추가"}</Text>
            <CircleButton text="×" onPress={onClose} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
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
              <Pressable style={styles.addChip} onPress={onAddField}><Text style={styles.addChipText}>+ 분야</Text></Pressable>
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
                setStartDate(date);
                setEndDate(date);
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
          {!!timePicker && (
            <TimePickerInlineOverlay
              title={timePicker?.label || "시간 선택"}
              value={timePicker?.value || "09:00"}
              onCancel={() => setTimePicker(null)}
              onConfirm={applyPickedTime}
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
            <Text style={styles.loginType}>● {session?.loginType || "email"}로 로그인</Text>
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

function FieldsScreen({ fields, tasks, onBack, onAdd, onEdit, onDelete }) {
  return (
    <View style={styles.screen}>
      <TopBar title="분야 관리" onBack={onBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}>
        {fields.map((field) => (
          <View key={field.id} style={styles.fieldRow}>
            <View style={[styles.fieldSwatch, { backgroundColor: field.color }]} />
            <Text style={styles.fieldName}>{field.name}</Text>
            <Text style={styles.fieldCount}>{tasks.filter((task) => task.fieldId === field.id).length}개</Text>
            <Pressable onPress={() => onEdit(field)}><Text style={styles.more}>수정</Text></Pressable>
            <Pressable onPress={() => onDelete(field.id)}><Text style={styles.deleteText}>삭제</Text></Pressable>
          </View>
        ))}
        <PrimaryButton label="새 분야 추가" onPress={onAdd} />
      </ScrollView>
    </View>
  );
}

function FieldSheet({ visible, field, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(fieldColors[0]);

  useEffect(() => {
    if (!visible) return;
    setName(field?.name || "");
    setColor(field?.color || fieldColors[0]);
  }, [visible, field]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.fieldSheet}>
          <SheetHandle />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>{field ? "분야 수정" : "분야 추가"}</Text>
            <CircleButton text="×" onPress={onClose} />
          </View>
          <Input label="분야 이름 *" value={name} onChangeText={setName} placeholder="예: 독서, 여행..." />
          <FieldLabel label="색상 *" />
          <View style={styles.colorGrid}>
            {fieldColors.map((item) => <Pressable key={item} style={[styles.colorDot, { backgroundColor: item }, color === item && styles.colorSelected]} onPress={() => setColor(item)} />)}
          </View>
          <PrimaryButton label={field ? "수정하기" : "추가하기"} disabled={!name.trim()} onPress={() => onSubmit({ id: field?.id, name: name.trim(), color })} />
        </View>
      </View>
    </Modal>
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
      {tasks.length === 0 && <Text style={styles.emptyText}>해당 우선순위의 할 일이 없어요.</Text>}
      {tasks.map((task) => <TaskCard key={task.id} task={task} field={fields.find((field) => field.id === task.fieldId)} onOpenTask={onOpenTask} onToggleTask={onToggleTask} />)}
    </View>
  );
}

function TaskCard({ task, field, onOpenTask, onToggleTask }) {
  const timeLabel = formatTaskTime(task);
  const reminderLabel = formatReminder(task);
  return (
    <Pressable style={styles.taskCard} onPress={() => onOpenTask(task.id)}>
      <Pressable style={[styles.check, task.done && styles.checkDone]} onPress={() => onToggleTask(task.id, !task.done)}>
        <Text style={styles.checkText}>{task.done ? "✓" : ""}</Text>
      </Pressable>
      <View style={styles.taskMid}>
        <Text numberOfLines={2} style={[styles.taskTitle, task.done && styles.doneTitle]}>{task.title}</Text>
        <View style={styles.metaRow}>
          {!!timeLabel && <Text style={styles.meta}>시간 {timeLabel}</Text>}
          {reminderLabel !== "알림 없음" && <Text style={styles.meta}>알림 {reminderLabel}</Text>}
          {!!task.memo && <Text style={styles.meta}>메모</Text>}
          <Text style={[styles.priorityTag, { backgroundColor: `${priorityColors[task.priority]}20`, color: priorityColors[task.priority] }]}>{task.priority}순위</Text>
          <Text style={[styles.fieldTag, { backgroundColor: `${field?.color || BLUE}22`, color: field?.color || BLUE }]}>{field?.name || "미지정"}</Text>
        </View>
      </View>
      <Text style={styles.more}>...</Text>
    </Pressable>
  );
}

function Input({ label, ...props }) {
  const required = label.trim().endsWith("*");
  const cleanLabel = required ? label.replace(/\s*\*$/, "") : label;
  return <View style={styles.inputWrap}><FieldLabel label={cleanLabel} required={required} /><TextInput style={[styles.input, props.multiline && styles.textArea]} placeholderTextColor="#c2cada" {...props} /></View>;
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

function SocialButton({ icon, label, bg, fg, onPress }) {
  return <Pressable style={[styles.socialButton, { backgroundColor: bg }]} onPress={onPress}><Text style={[styles.socialIcon, { color: fg }]}>{icon}</Text><Text style={[styles.socialText, { color: fg }]}>{label}</Text></Pressable>;
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

function SheetHandle() {
  return <View style={styles.handle} />;
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
  const [draftDate, setDraftDate] = useState(value || todayKey());

  useEffect(() => {
    if (visible) setDraftDate(value || todayKey());
  }, [visible, value]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.timeModalBackdrop}>
        <View style={styles.dateModalSheet}>
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
      </View>
    </Modal>
  );
}

function TimePickerInlineOverlay({ title, value, onCancel, onConfirm }) {
  return (
    <View style={styles.timeInlineOverlay}>
      <TimePickerContent title={title} value={value} onCancel={onCancel} onConfirm={onConfirm} />
    </View>
  );
}

function TimePickerModal({ visible, title, value, onCancel, onConfirm }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.timeModalBackdrop}>
        <TimePickerContent title={title} value={value} onCancel={onCancel} onConfirm={onConfirm} />
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

function TimePickerContent({ title, value, onCancel, onConfirm }) {
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
  selectedDot: { backgroundColor: "#9db1ff" },
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
  more: { color: MUTED, fontWeight: "900" },
  fab: { position: "absolute", right: 26, bottom: 28, width: 66, height: 66, borderRadius: 23, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", shadowColor: BLUE, shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  fabText: { color: "#fff", fontSize: 43, lineHeight: 48, fontWeight: "300" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.38)" },
  sheet: { maxHeight: "88%", backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28 },
  fieldSheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34 },
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
  fieldRow: { minHeight: 68, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: LINE, marginBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  fieldSwatch: { width: 18, height: 18, borderRadius: 9 },
  fieldName: { flex: 1, color: INK, fontSize: 17, fontWeight: "900" },
  fieldCount: { color: MUTED, fontWeight: "800" },
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
