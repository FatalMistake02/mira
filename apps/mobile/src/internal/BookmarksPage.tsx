import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useBookmarks, type Bookmark } from '../features/bookmarks/BookmarksProvider';
import { useTabs } from '../features/tabs/TabsProvider';
import { AppButton, type MobileTheme, stylesFor } from './shared';

function BookmarkNode({
  bookmark,
  depth,
  theme,
  expandedFolders,
  toggleFolder,
  onOpen,
  onDelete,
}: {
  bookmark: Bookmark;
  depth: number;
  theme: MobileTheme;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onOpen: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}) {
  const styles = stylesFor(theme);
  const isFolder = bookmark.type === 'folder';
  const isExpanded = expandedFolders.has(bookmark.id);

  return (
    <View style={[styles.listItem, { marginLeft: depth * 12 }]}>
      <Pressable onPress={() => (isFolder ? toggleFolder(bookmark.id) : onOpen(bookmark))}>
        <Text style={styles.listItemTitle}>
          {isFolder ? (isExpanded ? 'Folder v' : 'Folder >') : 'Link'} {bookmark.title}
        </Text>
        {!!bookmark.url && <Text style={styles.listItemMeta}>{bookmark.url}</Text>}
      </Pressable>
      <View style={styles.cardRow}>
        {!isFolder && <AppButton theme={theme} label="Open" onPress={() => onOpen(bookmark)} />}
        <AppButton theme={theme} label="Delete" danger onPress={() => onDelete(bookmark)} />
      </View>
      {isFolder && isExpanded && (bookmark.children?.length ? (
        bookmark.children.map((child) => (
          <BookmarkNode
            key={child.id}
            bookmark={child}
            depth={depth + 1}
            theme={theme}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))
      ) : (
        <Text style={styles.empty}>This folder is empty.</Text>
      ))}
    </View>
  );
}

export default function BookmarksPage({ theme }: { theme: MobileTheme }) {
  const styles = stylesFor(theme);
  const { bookmarks, addBookmark, deleteBookmark } = useBookmarks();
  const { navigate } = useTabs();
  const [folderName, setFolderName] = useState('');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkUrl, setBookmarkUrl] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (id: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageScroll}>
      <Text style={styles.title}>Bookmarks</Text>
      <Text style={styles.subtitle}>Folders and saved pages from your mobile Mira session.</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add Folder</Text>
        <TextInput
          value={folderName}
          onChangeText={setFolderName}
          placeholder="Folder name"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
        />
        <AppButton
          theme={theme}
          label="Create Folder"
          onPress={() => {
            if (!folderName.trim()) return;
            addBookmark({
              title: folderName.trim(),
              type: 'folder',
            });
            setFolderName('');
          }}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add Bookmark</Text>
        <TextInput
          value={bookmarkTitle}
          onChangeText={setBookmarkTitle}
          placeholder="Title"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
        />
        <TextInput
          value={bookmarkUrl}
          onChangeText={setBookmarkUrl}
          placeholder="URL"
          placeholderTextColor={theme.colors.textDim}
          style={styles.textInput}
          autoCapitalize="none"
        />
        <AppButton
          theme={theme}
          label="Save Bookmark"
          onPress={() => {
            if (!bookmarkUrl.trim()) return;
            addBookmark({
              title: bookmarkTitle.trim() || bookmarkUrl.trim(),
              type: 'bookmark',
              url: bookmarkUrl.trim(),
            });
            setBookmarkTitle('');
            setBookmarkUrl('');
          }}
        />
      </View>
      {bookmarks.length ? (
        bookmarks.map((bookmark) => (
          <BookmarkNode
            key={bookmark.id}
            bookmark={bookmark}
            depth={0}
            theme={theme}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onOpen={(value) => value.url && navigate(value.url)}
            onDelete={(value) => deleteBookmark(value.id)}
          />
        ))
      ) : (
        <Text style={styles.empty}>No bookmarks yet.</Text>
      )}
    </ScrollView>
  );
}
