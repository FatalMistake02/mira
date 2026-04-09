import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../features/themes/ThemeProvider';
import { useBookmarks } from '../features/bookmarks/BookmarksProvider';

const Bookmarks = () => {
  const { theme } = useTheme();
  const { bookmarks, removeBookmark, loadBookmarks } = useBookmarks();

  useEffect(() => {
    loadBookmarks();
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Bookmark', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeBookmark(id) },
    ]);
  };

  const renderBookmark = ({ item }: any) => (
    <View style={[styles.bookmarkItem, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={styles.bookmarkContent}>
        <Text style={[styles.bookmarkTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.bookmarkUrl, { color: theme.colors.primary }]} numberOfLines={1}>
          {item.url}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)}>
        <Icon name="trash-bin" size={20} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {bookmarks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="bookmark-outline" size={48} color={theme.colors.primary} />
          <Text style={[styles.emptyText, { color: theme.colors.text }]}>No bookmarks yet</Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          renderItem={renderBookmark}
          keyExtractor={(item) => item.id}
          scrollEnabled={true}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bookmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    justifyContent: 'space-between',
  },
  bookmarkContent: {
    flex: 1,
    marginRight: 12,
  },
  bookmarkTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookmarkUrl: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
});

export default Bookmarks;
