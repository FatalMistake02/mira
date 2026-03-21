import { useState } from 'react';
import { useTabs } from '../features/tabs/TabsProvider';
import type { Bookmark } from '../features/bookmarks/BookmarksProvider';
import { useBookmarks } from '../features/bookmarks/BookmarksProvider';
import { Folder, FolderOpen, Plus, Trash2, Edit2, X, Check } from 'lucide-react';

function BookmarkItem({ 
  bookmark, 
  level = 0, 
  onDelete, 
  onEdit,
  expandedFolders,
  onToggleFolder
}: { 
  bookmark: Bookmark; 
  level?: number; 
  onDelete: (id: string) => void;
  onEdit: (bookmark: Bookmark) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
}) {
  const { navigate, tabs } = useTabs();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(bookmark.title);
  const [editUrl, setEditUrl] = useState(bookmark.url || '');

  const handleSave = () => {
    onEdit({ ...bookmark, title: editTitle, url: editUrl });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url || '');
    setIsEditing(false);
  };

  const handleClick = () => {
    if (bookmark.type === 'folder') {
      onToggleFolder(bookmark.id);
      return;
    }
    if (bookmark.url) navigate(bookmark.url);
  };

  // Function to get favicon for a bookmark URL
  const getTabFavicon = (url?: string) => {
    if (!url) return undefined;
    
    // First try to find an open tab with this URL
    const tab = tabs.find(tab => tab.url === url);
    if (tab?.favicon) {
      return tab.favicon;
    }
    
    // If no open tab, try to construct favicon URL
    try {
      const urlObj = new URL(url);
      const faviconUrl = `${urlObj.origin}/favicon.ico`;
      return faviconUrl;
    } catch {
      return undefined;
    }
  };

  const tabFavicon = getTabFavicon(bookmark.url);

  const icon = bookmark.type === 'folder' 
    ? (expandedFolders.has(bookmark.id) ? <FolderOpen size={16} /> : <Folder size={16} />)
    : tabFavicon ? (
      <img 
        src={tabFavicon} 
        alt="" 
        style={{ 
          width: 16, 
          height: 16,
          display: 'block'
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement;
          if (fallback) {
            fallback.style.display = 'block';
          }
        }}
      />
    ) : null;

  return (
    <div style={{ paddingLeft: level * 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: 4,
          cursor: bookmark.type === 'folder' ? 'default' : 'pointer',
          backgroundColor: 'transparent',
          border: '1px solid transparent',
          transition: 'background-color 0.15s ease',
        }}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (bookmark.type !== 'folder') {
            e.currentTarget.style.backgroundColor = 'var(--surfaceHover)';
            e.currentTarget.style.border = '1px solid var(--surfaceBorder)';
          }
        }}
        onMouseLeave={(e) => {
          if (bookmark.type !== 'folder') {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.border = '1px solid transparent';
          }
        }}
      >
        <div style={{ marginRight: 8, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
          {bookmark.type === 'folder' ? (
            icon
          ) : (
            <>
              {icon}
              {!icon && (
                <div 
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '3px',
                    background: 'var(--accent)',
                    display: 'block'
                  }}
                />
              )}
            </>
          )}
        </div>
        
        {isEditing ? (
          <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="theme-input"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="Title"
            />
            {bookmark.type === 'bookmark' && (
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="theme-input"
                style={{ flex: 2, fontSize: 13 }}
                placeholder="URL"
              />
            )}
            <button
              onClick={handleSave}
              className="theme-btn theme-btn-primary"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancel}
              className="theme-btn theme-btn-nav"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={bookmark.title}
              >
                {bookmark.title}
              </div>
              {bookmark.type === 'bookmark' && bookmark.url && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={bookmark.url}
                >
                  {bookmark.url}
                </div>
              )}
              {bookmark.type === 'folder' && bookmark.children && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {bookmark.children.length} items
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="theme-btn theme-btn-nav"
                style={{ padding: '4px 8px', fontSize: 12 }}
                title="Edit"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(bookmark.id);
                }}
                className="theme-btn theme-btn-nav"
                style={{ padding: '4px 8px', fontSize: 12 }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>
      
      {bookmark.type === 'folder' && expandedFolders.has(bookmark.id) && bookmark.children?.map((child: Bookmark) => (
        <BookmarkItem
          key={child.id}
          bookmark={child}
          level={level + 1}
          onDelete={onDelete}
          onEdit={onEdit}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </div>
  );
}

export default function Bookmarks() {
  const { bookmarks, addBookmark, deleteBookmark, updateBookmark } = useBookmarks();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<'bookmark' | 'folder'>('bookmark');
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;

    const bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'> = {
      title,
      type: newType,
      url: newType === 'bookmark' ? newUrl.trim() : undefined,
      parentId: selectedParent || undefined,
      children: newType === 'folder' ? [] : undefined,
    };

    addBookmark(bookmark);
    setNewTitle('');
    setNewUrl('');
    setNewType('bookmark');
    setSelectedParent(null);
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this bookmark?')) {
      deleteBookmark(id);
    }
  };

  const handleEdit = (bookmark: Bookmark) => {
    updateBookmark(bookmark);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const renderBookmarkOptions = (bookmark: Bookmark, level = 0): string => {
    const indent = '　'.repeat(level);
    return `${indent}${bookmark.title}`;
  };

  const getAllBookmarksForSelect = (bookmarks: Bookmark[], level = 0): Array<{ value: string; label: string }> => {
    const options: Array<{ value: string; label: string }> = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.type === 'folder') {
        options.push({
          value: bookmark.id,
          label: renderBookmarkOptions(bookmark, level),
        });
        if (bookmark.children) {
          options.push(...getAllBookmarksForSelect(bookmark.children, level + 1));
        }
      }
    }
    
    return options;
  };

  const folderOptions = getAllBookmarksForSelect(bookmarks);

  return (
    <div style={{ padding: 20, background: 'var(--bg)', color: 'var(--text1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Bookmarks</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="theme-btn theme-btn-primary"
          style={{ 
            padding: '10px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            borderRadius: '6px',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Plus size={16} />
          Add Bookmark
        </button>
      </div>

      {showAddForm && (
        <div className="theme-panel" style={{ padding: 16, marginBottom: 20, borderRadius: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Type:</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'bookmark' | 'folder')}
                className="theme-input"
                style={{ padding: '6px 10px', fontSize: 13 }}
              >
                <option value="bookmark">Bookmark</option>
                <option value="folder">Folder</option>
              </select>
            </div>

            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="theme-input"
              style={{ padding: '8px 12px', fontSize: 13 }}
            />

            {newType === 'bookmark' && (
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL (e.g., https://example.com)"
                className="theme-input"
                style={{ padding: '8px 12px', fontSize: 13 }}
              />
            )}

            {folderOptions.length > 0 && (
              <select
                value={selectedParent || ''}
                onChange={(e) => setSelectedParent(e.target.value || null)}
                className="theme-input"
                style={{ padding: '8px 12px', fontSize: 13 }}
              >
                <option value="">Root level</option>
                {folderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleAdd}
                className="theme-btn theme-btn-primary"
                style={{ 
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewTitle('');
                  setNewUrl('');
                  setSelectedParent(null);
                }}
                className="theme-btn theme-btn-nav"
                style={{ 
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: 14,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bookmarks.length === 0 ? (
        <div className="theme-text2" style={{ textAlign: 'center', padding: 40 }}>
          No bookmarks yet. Click "Add Bookmark" to get started.
        </div>
      ) : (
        <div className="theme-panel" style={{ borderRadius: 8, overflow: 'hidden' }}>
          {bookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.id}
              bookmark={bookmark}
              onDelete={handleDelete}
              onEdit={handleEdit}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
