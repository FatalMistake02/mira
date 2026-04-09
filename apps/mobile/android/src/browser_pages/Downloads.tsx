import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../features/themes/ThemeProvider';
import { useDownloads } from '../features/downloads/DownloadProvider';

const Downloads = () => {
  const { theme } = useTheme();
  const { downloads, removeDownload, loadDownloads } = useDownloads();

  useEffect(() => {
    loadDownloads();
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Download', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDownload(id) },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#34C759';
      case 'downloading':
        return theme.colors.primary;
      case 'failed':
        return '#FF3B30';
      default:
        return theme.colors.primary;
    }
  };

  const renderDownload = ({ item }: any) => (
    <View style={[styles.downloadItem, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Icon
        name={item.status === 'completed' ? 'checkmark-circle' : 'hourglass-outline'}
        size={32}
        color={getStatusColor(item.status)}
        style={styles.statusIcon}
      />
      <View style={styles.downloadContent}>
        <Text style={[styles.downloadName, { color: theme.colors.text }]} numberOfLines={1}>
          {item.filename}
        </Text>
        <Text style={[styles.downloadStatus, { color: theme.colors.primary }]} numberOfLines={1}>
          {item.status} • {item.progress}%
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)}>
        <Icon name="trash-bin" size={20} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {downloads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="download-outline" size={48} color={theme.colors.primary} />
          <Text style={[styles.emptyText, { color: theme.colors.text }]}>No downloads yet</Text>
        </View>
      ) : (
        <FlatList
          data={downloads}
          renderItem={renderDownload}
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
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statusIcon: {
    marginRight: 12,
  },
  downloadContent: {
    flex: 1,
    marginRight: 12,
  },
  downloadName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  downloadStatus: {
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

export default Downloads;
