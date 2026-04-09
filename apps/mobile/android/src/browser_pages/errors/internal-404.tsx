import React from 'react';
import ErrorLayout from './ErrorLayout';

const NotFoundError = () => (
  <ErrorLayout
    title="Page Not Found"
    message="The page you're looking for could not be found. Please check the URL and try again."
    icon="alert-circle-outline"
  />
);

export default NotFoundError;
