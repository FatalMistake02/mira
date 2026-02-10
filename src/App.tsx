import { useState, useRef } from 'react';
import AddressBar from './components/AddressBar';

function App() {
  const [url, setUrl] = useState('https://www.example.com');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const go = () => {
    if (iframeRef.current) iframeRef.current.src = url;
  };

  return (
    <div style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
      <AddressBar url={url} setUrl={setUrl} onGo={go} />
      <iframe
        ref={iframeRef}
        src={url}
        style={{flex: 1, border: 'none'}}
      />
    </div>
  );
}

export default App;
