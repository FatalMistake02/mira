import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createId } from '../../app/ids';
import { getCachedJson, setCachedJson } from '../../storage/cacheStorage';

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
  moveBookmarkInFolder: (id: string, folderId: string | undefined, toIndex: number) => void;
  moveBookmarkToFolder: (id: string, targetFolderId: string | null) => void;
};

const STORAGE_KEY = 'mira.mobile.bookmarks.v1';
const BookmarksContext = createContext<BookmarksContextType | undefined>(undefined);

function loadBookmarksFromStorage(): Bookmark[] {
  const stored = getCachedJson<Bookmark[]>(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function saveBookmarksToStorage(bookmarks: Bookmark[]): void {
  setCachedJson(STORAGE_KEY, bookmarks);
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

function bookmarkTreeContainsId(bookmarks: Bookmark[] | undefined, id: string): boolean {
  if (!bookmarks) return false;
  return findBookmarkById(bookmarks, id) !== undefined;
}

function deleteBookmarkFromTree(bookmarks: Bookmark[], id: string): Bookmark[] {
  return bookmarks
    .filter((bookmark) => bookmark.id !== id)
    .map((bookmark) => ({
      ...bookmark,
      children: bookmark.children ? deleteBookmarkFromTree(bookmark.children, id) : undefined,
    }));
}

function updateBookmarkInTree(bookmarks: Bookmark[], updatedBookmark: Bookmark): Bookmark[] {
  return bookmarks.map((bookmark) => {
    if (bookmark.id === updatedBookmark.id) {
      return { ...updatedBookmark, updatedAt: Date.now() };
    }
    if (bookmark.children) {
      return {
        ...bookmark,
        children: updateBookmarkInTree(bookmark.children, updatedBookmark),
      };
    }
    return bookmark;
  });
}

function moveBookmarkInTree(bookmarks: Bookmark[], id: string, toIndex: number): Bookmark[] {
  const fromIndex = bookmarks.findIndex((bookmark) => bookmark.id === id);
  if (fromIndex === -1) return bookmarks;

  const normalizedTargetIndex = Math.floor(toIndex);
  if (!Number.isFinite(normalizedTargetIndex)) return bookmarks;

  const boundedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, bookmarks.length - 1));
  if (boundedTargetIndex === fromIndex) return bookmarks;

  const nextBookmarks = [...bookmarks];
  const [moved] = nextBookmarks.splice(fromIndex, 1);
  const boundedIndex = Math.max(0, Math.min(boundedTargetIndex, nextBookmarks.length));
  nextBookmarks.splice(boundedIndex, 0, moved);
  return nextBookmarks;
}

function findBookmarkAndParent(
  bookmarks: Bookmark[],
  id: string,
  parent: Bookmark | null = null,
): { bookmark: Bookmark | undefined; parent: Bookmark | null } {
  for (const bookmark of bookmarks) {
    if (bookmark.id === id) {
      return { bookmark, parent };
    }
    if (bookmark.children) {
      const found = findBookmarkAndParent(bookmark.children, id, bookmark);
      if (found.bookmark) return found;
    }
  }
  return { bookmark: undefined, parent: null };
}

function removeBookmarkFromTree(bookmarks: Bookmark[], id: string): Bookmark[] {
  return bookmarks
    .filter((bookmark) => bookmark.id !== id)
    .map((bookmark) => ({
      ...bookmark,
      children: bookmark.children ? removeBookmarkFromTree(bookmark.children, id) : undefined,
    }));
}

function addBookmarkToFolder(bookmarks: Bookmark[], bookmark: Bookmark, folderId: string): Bookmark[] {
  return bookmarks.map((item) => {
    if (item.id === folderId && item.type === 'folder') {
      return {
        ...item,
        children: [...(item.children || []), bookmark],
        updatedAt: Date.now(),
      };
    }
    if (item.children) {
      return {
        ...item,
        children: addBookmarkToFolder(item.children, bookmark, folderId),
      };
    }
    return item;
  });
}

function moveBookmarkBetweenParents(
  bookmarks: Bookmark[],
  id: string,
  targetFolderId: string | null,
): Bookmark[] {
  const { bookmark } = findBookmarkAndParent(bookmarks, id);
  if (!bookmark) return bookmarks;
  if (targetFolderId === id) return bookmarks;
  if (bookmark.type === 'folder' && bookmarkTreeContainsId(bookmark.children, targetFolderId ?? '')) {
    return bookmarks;
  }

  let nextBookmarks = removeBookmarkFromTree(bookmarks, id);
  const updatedBookmark = {
    ...bookmark,
    parentId: targetFolderId || undefined,
    updatedAt: Date.now(),
  };

  if (targetFolderId) {
    nextBookmarks = addBookmarkToFolder(nextBookmarks, updatedBookmark, targetFolderId);
  } else {
    nextBookmarks = [...nextBookmarks, updatedBookmark];
  }

  return nextBookmarks;
}

function moveBookmarkInTreeAtParent(
  bookmarks: Bookmark[],
  id: string,
  folderId: string | undefined,
  toIndex: number,
): Bookmark[] {
  if (!folderId) {
    return moveBookmarkInTree(bookmarks, id, toIndex);
  }

  return bookmarks.map((bookmark) => {
    if (bookmark.id === folderId && bookmark.type === 'folder' && bookmark.children) {
      const fromIndex = bookmark.children.findIndex((child) => child.id === id);
      if (fromIndex === -1) return bookmark;

      const boundedTargetIndex = Math.max(0, Math.min(toIndex, bookmark.children.length - 1));
      if (boundedTargetIndex === fromIndex) return bookmark;

      const nextChildren = [...bookmark.children];
      const [moved] = nextChildren.splice(fromIndex, 1);
      const boundedIndex = Math.max(0, Math.min(boundedTargetIndex, nextChildren.length));
      nextChildren.splice(boundedIndex, 0, moved);

      return {
        ...bookmark,
        children: nextChildren,
        updatedAt: Date.now(),
      };
    }

    if (bookmark.children) {
      return {
        ...bookmark,
        children: moveBookmarkInTreeAtParent(bookmark.children, id, folderId, toIndex),
      };
    }

    return bookmark;
  });
}

function addBookmarkToTree(
  bookmarks: Bookmark[],
  newBookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>,
  parentId?: string,
): Bookmark[] {
  const bookmark: Bookmark = {
    ...newBookmark,
    id: createId('bookmark'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (!parentId) {
    return [...bookmarks, bookmark];
  }

  return bookmarks.map((existingBookmark) => {
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
        children: addBookmarkToTree(existingBookmark.children, newBookmark, parentId),
      };
    }
    return existingBookmark;
  });
}

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarksFromStorage());

  const addBookmark = useCallback((bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => {
    setBookmarks((previous) => {
      const updated = addBookmarkToTree(previous, bookmark, bookmark.parentId);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setBookmarks((previous) => {
      const updated = deleteBookmarkFromTree(previous, id);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const updateBookmark = useCallback((bookmark: Bookmark) => {
    setBookmarks((previous) => {
      const updated = updateBookmarkInTree(previous, bookmark);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const getBookmarkById = useCallback(
    (id: string): Bookmark | undefined => findBookmarkById(bookmarks, id),
    [bookmarks],
  );

  const moveBookmarkInFolder = useCallback(
    (id: string, folderId: string | undefined, toIndex: number) => {
      if (!id) return;
      setBookmarks((previous) => {
        const updated = moveBookmarkInTreeAtParent(previous, id, folderId, toIndex);
        saveBookmarksToStorage(updated);
        return updated;
      });
    },
    [],
  );

  const moveBookmark = useCallback((id: string, toIndex: number) => {
    if (!id) return;
    setBookmarks((previous) => {
      const updated = moveBookmarkInTree(previous, id, toIndex);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const moveBookmarkToFolder = useCallback((id: string, targetFolderId: string | null) => {
    if (!id) return;
    setBookmarks((previous) => {
      const updated = moveBookmarkBetweenParents(previous, id, targetFolderId);
      saveBookmarksToStorage(updated);
      return updated;
    });
  }, []);

  const value = useMemo(
    () => ({
      bookmarks,
      addBookmark,
      deleteBookmark,
      updateBookmark,
      getBookmarkById,
      moveBookmark,
      moveBookmarkInFolder,
      moveBookmarkToFolder,
    }),
    [
      addBookmark,
      bookmarks,
      deleteBookmark,
      getBookmarkById,
      moveBookmark,
      moveBookmarkInFolder,
      moveBookmarkToFolder,
      updateBookmark,
    ],
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks(): BookmarksContextType {
  const context = useContext(BookmarksContext);
  if (!context) {
    throw new Error('useBookmarks must be used within BookmarksProvider');
  }
  return context;
}
