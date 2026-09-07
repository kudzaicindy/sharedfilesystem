import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ModalProvider } from './components/modals/ModalProvider';
import { FilesProvider } from './context/FilesContext';
import { LocalEditProvider } from './context/LocalEditContext';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import InvitePage from './pages/InvitePage';
import HomeDashboardPage from './pages/HomeDashboardPage';
import AllFilesPage from './pages/AllFilesPage';
import SendTrackPage from './pages/SendTrackPage';
import SharedPage from './pages/SharedPage';
import FileRequestsPage from './pages/FileRequestsPage';
import DeletedPage from './pages/DeletedPage';
import QuickAccessPage from './pages/QuickAccessPage';
import OnlyOfficeEditorPage from './pages/OnlyOfficeEditorPage';
import Ms365EditorPage from './pages/Ms365EditorPage';
import Ms365LinkPage from './pages/Ms365LinkPage';
import SimpleDocxEditorPage from './pages/SimpleDocxEditorPage';
import SimpleXlsxEditorPage from './pages/SimpleXlsxEditorPage';
import PublicUploadPage from './pages/PublicUploadPage';
import CollabEditorPage from './pages/CollabEditorPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400 text-sm">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/upload/:token" element={<PublicUploadPage />} />
      <Route path="/collab/:docId" element={<CollabEditorPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/ms365/link" element={<Ms365LinkPage />} />
      <Route
        path="/ms365/:docId"
        element={(
          <PrivateRoute>
            <Ms365EditorPage />
          </PrivateRoute>
        )}
      />
      <Route
        path="/editor/:docId"
        element={(
          <PrivateRoute>
            <OnlyOfficeEditorPage />
          </PrivateRoute>
        )}
      />
      <Route
        path="/docx-editor/:docId"
        element={(
          <PrivateRoute>
            <SimpleDocxEditorPage />
          </PrivateRoute>
        )}
      />
      <Route
        path="/xlsx-editor/:docId"
        element={(
          <PrivateRoute>
            <SimpleXlsxEditorPage />
          </PrivateRoute>
        )}
      />
      <Route
        element={
          <PrivateRoute>
            <FilesProvider>
              <AppLayout />
            </FilesProvider>
          </PrivateRoute>
        }
      >
        <Route index element={<HomeDashboardPage />} />
        <Route path="files" element={<AllFilesPage />} />
        <Route path="send-track" element={<SendTrackPage />} />
        <Route path="signatures" element={<Navigate to="/send-track" replace />} />
        <Route path="shared" element={<SharedPage />} />
        <Route path="file-requests" element={<FileRequestsPage />} />
        <Route path="deleted" element={<DeletedPage />} />
        <Route path="quick/:tag" element={<QuickAccessPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ModalProvider>
          <LocalEditProvider>
            <AppRoutes />
          </LocalEditProvider>
        </ModalProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
