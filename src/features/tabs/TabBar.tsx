import { useTabs } from './TabsProvider';

export default function TabBar() {
  const { tabs, activeId, setActive, closeTab, newTab } = useTabs();

  return (
    <div style={{ display: 'flex', background: '#222' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActive(tab.id)}
          style={{
            padding: '6px 10px',
            cursor: 'pointer',
            background: tab.id === activeId ? '#333' : '#222',
            color: 'white',
            display: 'flex',
            gap: 6,
          }}
        >
          <span>Tab</span>
          {tab.isSleeping ? (
            <span title="Sleeping" style={{ fontSize: 10, opacity: 0.75 }}>
              zz
            </span>
          ) : null}
          <span
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            x
          </span>
        </div>
      ))}

      <button onClick={() => newTab()}>+</button>
    </div>
  );
}
