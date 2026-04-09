import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  createdAt: number;
}

interface BookmarksContextType {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  updateBookmark: (id: string, bookmark: Partial<Bookmark>) => Promise<void>;
  loadBookmarks: () => Promise<void>;
}

const BookmarksContext = createContext<BookmarksContextType | undefined>(undefined);

export const BookmarksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const loadBookmarks = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('bookmarks');
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    }
  }, []);

  const saveBookmarks = useCallback(async (newBookmarks: Bookmark[]) => {
    try {
      await AsyncStorage.setItem('bookmarks', JSON.stringify(newBookmarks));
      setBookmarks(newBookmarks);
    } catch (error) {
      console.error('Failed to save bookmarks:', error);
    }
  }, []);

  const addBookmark = useCallback(
    async (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => {
      const newBookmark: Bookmark = {
        ...bookmark,
        id: Date.now().toString(),
        createdAt: Date.now(),
      };
      await saveBookmarks([...bookmarks, newBookmark]);
    },
    [bookmarks, saveBookmarks]
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      const updated = bookmarks.filter((b) => b.id !== id);
      await saveBookmarks(updated);
    },
    [bookmarks, saveBookmarks]
  );

  const updateBookmark = useCallback(
    async (id: string, updates: Partial<Bookmark>) => {
      const updated = bookmarks.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      );
      await saveBookmarks(updated);
    },
    [bookmarks, saveBookmarks]
  );

  return (
    <BookmarksContext.Provider
      value={{
        bookmarks,
        addBookmark,
        removeBookmark,
        updateBookmark,
        loadBookmarks,
      }}
    >
      {children}
    </BookmarksContext.Provider>
  );
};

export const useBookmarks = () => {
  const context = useContext(BookmarksContext);
  if (!context) {
    throw new Error('useBookmarks must be used within BookmarksProvider');
  }
  return context;
};
