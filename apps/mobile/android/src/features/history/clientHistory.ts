import AsyncStorage from '@react-native-async-storage/async-storage';
import { HistoryEntry } from './types';

export const addToHistory = async (url: string, title: string) => {
  try {
    const history = await getHistory();
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      url,
      title,
      visitedAt: Date.now(),
    };
    history.push(entry);
    
    // Keep only last 500 entries
    if (history.length > 500) {
      history.shift();
    }
    
    await AsyncStorage.setItem('history', JSON.stringify(history));
    return entry;
  } catch (error) {
    console.error('Failed to add to history:', error);
    return null;
  }
};

export const getHistory = async (): Promise<HistoryEntry[]> => {
  try {
    const history = await AsyncStorage.getItem('history');
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Failed to get history:', error);
    return [];
  }
};

export const clearHistory = async () => {
  try {
    await AsyncStorage.removeItem('history');
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
};
