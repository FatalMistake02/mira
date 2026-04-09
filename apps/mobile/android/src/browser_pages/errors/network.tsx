import React from 'react';
import ErrorLayout from './ErrorLayout';

const NetworkError = () => (
  <ErrorLayout
    title="Network Error"
    message="Unable to connect to the network. Please check your connection and try again."
    icon="wifi-outline"
  />
);

export default NetworkError;
