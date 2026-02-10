interface AddressBarProps {
  url: string;
  setUrl: (url: string) => void;
  onGo: () => void;
}

export default function AddressBar({ url, setUrl, onGo }: AddressBarProps) {
  return (
    <div style={{display: 'flex'}}>
      <input
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        style={{flex: 1, padding: '4px'}}
      />
      <button onClick={onGo}>Go</button>
    </div>
  );
}
