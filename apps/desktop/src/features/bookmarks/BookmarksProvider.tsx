import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Bookmark = {
  id: string;
  title: string;
  type: 'bookmark' | 'folder';
  url?: string;
  parentId?: string;
  children?: Bookmark[];
  createdAt: number;
  updatedAt: number;
};

type BookmarksContextType = {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => void;
  deleteBookmark: (id: string) => void;
  updateBookmark: (bookmark: Bookmark) => void;
  getBookmarkById: (id: string) => Bookmark | undefined;
  moveBookmark: (id: string, toIndex: number) => void;
};

const BookmarksContext = createContext<BookmarksContextType | undefined>(undefined);

const STORAGE_KEY = 'mira.bookmarks.v1';

function generateId(): string {
  return `bookmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function loadBookmarksFromStorage(): Bookmark[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookmarksToStorage(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Silent fail for storage issues
  }
}

function findBookmarkById(bookmarks: Bookmark[], id: string): Bookmark | undefined {
  for (const bookmark of bookmarks) {
    if (bookmark.id === id) return bookmark;
    if (bookmark.children) {
      const found = findBookmarkById(bookmark.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function deleteBookmarkFromTree(bookmarks: Bookmark[], id: string): Bookmark[] {
  return bookmarks
    .filter(bookmark => bookmark.id !== id)
    .map(bookmark => ({
      ...bookmark,
      children: bookmark.children ? deleteBookmarkFromTree(bookmark.children, id) : undefined
    }));
}

function updateBookmarkInTree(bookmarks: Bookmark[], updatedBookmark: Bookmark): Bookmark[] {
  return bookmarks.map(bookmark => {
    if (bookmark.id === updatedBookmark.id) {
      return { ...updatedBookmark, updatedAt: Date.now() };
    }
    if (bookmark.children) {
      return {
        ...bookmark,
        children: updateBookmarkInTree(bookmark.children, updatedBookmark)
      };
    }
    return bookmark;
  });
}

function moveBookmarkInTree(bookmarks: Bookmark[], id: string, toIndex: number): Bookmark[] {
  const fromIndex = bookmarks.findIndex(b => b.id === id);
  if (fromIndex === -1) return bookmarks;

  const normalizedToIndex = Math.floor(toIndex);
  if (!Number.isFinite(normalizedToIndex)) return bookmarks;

  const boundedTargetIndex = Math.max(0, Math.min(normalizedToIndex, bookmarks.length - 1));
  if (boundedTargetIndex === fromIndex) {
    return bookmarks;
  }

  const nextBookmarks = [...bookmarks];
  const [moved] = nextBookmarks.splice(fromIndex, 1);
  const boundedIndex = Math.max(0, Math.min(boundedTargetIndex, nextBookmarks.length));
  nextBookmarks.splice(boundedIndex, 0, moved);
  return nextBookmarks;
}
function addBookmarkToTree(
  bookmarks: Bookmark[], 
  newBookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>,
  parentId?: string
): Bookmark[] {
  const bookmark: Bookmark = {
    ...newBookmark,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (!parentId) {
    return [...bookmarks, bookmark];
  }

  return bookmarks.map(existingBookmark => {
    if (existingBookmark.id === parentId && existingBookmark.type === 'folder') {
      return {
        ...existingBookmark,
        children: [...(existingBookmark.children || []), bookmark],
        updatedAt: Date.now(),
      };
    }
    if (existingBookmark.children) {
      return {
        ...existingBookmark,
        children: addBookmarkToTree(existingBookmark.children, newBookmark, parentId)
      };
    }
    return existingBookmark;
  });
}

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarksFromStorage());

  const addBookmark = useCallback((bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => {
    setBookmarks(prev => {
      const updated = addBookmarkToTree(prev, bookmark, bookmark.parentId);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const updated = deleteBookmarkFromTree(prev, id);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const updateBookmark = useCallback((bookmark: Bookmark) => {
    setBookmarks(prev => {
      const updated = updateBookmarkInTree(prev, bookmark);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const getBookmarkById = useCallback((id: string): Bookmark | undefined => {
    return findBookmarkById(bookmarks, id);
  }, [bookmarks]);

  const moveBookmark = useCallback((id: string, toIndex: number) => {
    if (!id) return;

    setBookmarks(prev => {
      const updated = moveBookmarkInTree(prev, id, toIndex);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  return (
    <BookmarksContext.Provider value={{
      bookmarks,
      addBookmark,
      deleteBookmark,
      updateBookmark,
      getBookmarkById,
      moveBookmark,
    }}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks(): BookmarksContextType {
  const context = useContext(BookmarksContext);
  if (context === undefined) {
    throw new Error('useBookmarks must be used within a BookmarksProvider');
  }
  return context;
}
