import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserProfile,
  Putter,
  GolfCourse,
  Round,
  STORAGE_KEYS,
  DEFAULT_USER_PROFILE,
} from './types';

// ユニークID生成
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ユーザープロフィール
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const existing = await getUserProfile();
    const now = new Date().toISOString();
    
    const updated: UserProfile = existing
      ? { ...existing, ...profile, updatedAt: now }
      : {
          id: generateId(),
          ...DEFAULT_USER_PROFILE,
          ...profile,
          createdAt: now,
          updatedAt: now,
        };
    
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
}

// パター管理
export async function getPutters(): Promise<Putter[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PUTTERS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting putters:', error);
    return [];
  }
}

export async function savePutter(putter: Omit<Putter, 'id' | 'createdAt' | 'updatedAt'>): Promise<Putter> {
  try {
    const putters = await getPutters();
    const now = new Date().toISOString();
    
    const newPutter: Putter = {
      ...putter,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    
    putters.push(newPutter);
    await AsyncStorage.setItem(STORAGE_KEYS.PUTTERS, JSON.stringify(putters));
    return newPutter;
  } catch (error) {
    console.error('Error saving putter:', error);
    throw error;
  }
}

export async function updatePutter(id: string, updates: Partial<Putter>): Promise<Putter | null> {
  try {
    const putters = await getPutters();
    const index = putters.findIndex(p => p.id === id);
    
    if (index === -1) return null;
    
    putters[index] = {
      ...putters[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.PUTTERS, JSON.stringify(putters));
    return putters[index];
  } catch (error) {
    console.error('Error updating putter:', error);
    throw error;
  }
}

export async function deletePutter(id: string): Promise<boolean> {
  try {
    const putters = await getPutters();
    const filtered = putters.filter(p => p.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.PUTTERS, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting putter:', error);
    return false;
  }
}

// コース管理
export async function getCourses(): Promise<GolfCourse[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.COURSES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting courses:', error);
    return [];
  }
}

export async function saveCourse(course: Omit<GolfCourse, 'id' | 'createdAt'>): Promise<GolfCourse> {
  try {
    const courses = await getCourses();
    const now = new Date().toISOString();
    
    const newCourse: GolfCourse = {
      ...course,
      id: generateId(),
      createdAt: now,
    };
    
    courses.push(newCourse);
    await AsyncStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
    return newCourse;
  } catch (error) {
    console.error('Error saving course:', error);
    throw error;
  }
}

export async function deleteCourse(id: string): Promise<boolean> {
  try {
    const courses = await getCourses();
    const filtered = courses.filter(c => c.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting course:', error);
    return false;
  }
}

// ラウンド管理
export async function getRounds(): Promise<Round[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.ROUNDS);
    const rounds: Round[] = data ? JSON.parse(data) : [];
    // 日付降順でソート
    return rounds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('Error getting rounds:', error);
    return [];
  }
}

export async function getRound(id: string): Promise<Round | null> {
  try {
    const rounds = await getRounds();
    return rounds.find(r => r.id === id) || null;
  } catch (error) {
    console.error('Error getting round:', error);
    return null;
  }
}

export async function saveRound(round: Omit<Round, 'id' | 'createdAt' | 'updatedAt'>): Promise<Round> {
  try {
    const rounds = await getRounds();
    const now = new Date().toISOString();
    
    const newRound: Round = {
      ...round,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    
    rounds.push(newRound);
    await AsyncStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(rounds));
    return newRound;
  } catch (error) {
    console.error('Error saving round:', error);
    throw error;
  }
}

export async function updateRound(id: string, updates: Partial<Round>): Promise<Round | null> {
  try {
    const rounds = await getRounds();
    const index = rounds.findIndex(r => r.id === id);
    
    if (index === -1) return null;
    
    rounds[index] = {
      ...rounds[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await AsyncStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(rounds));
    return rounds[index];
  } catch (error) {
    console.error('Error updating round:', error);
    throw error;
  }
}

export async function deleteRound(id: string): Promise<boolean> {
  try {
    const rounds = await getRounds();
    const filtered = rounds.filter(r => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting round:', error);
    return false;
  }
}

// 全データクリア（開発用）
export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.PUTTERS,
      STORAGE_KEYS.COURSES,
      STORAGE_KEYS.ROUNDS,
    ]);
  } catch (error) {
    console.error('Error clearing all data:', error);
    throw error;
  }
}
