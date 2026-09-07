import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import CloudLayout from '../components/layout/CloudLayout';
export default function AppLayout() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <CloudLayout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      <Outlet context={{ searchQuery }} />
    </CloudLayout>
  );
}
