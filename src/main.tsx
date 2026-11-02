import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './styles.css';
import './profile.css';
import './i18n';
import { App, NotFound } from './app';
import { Play } from './play';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, useParams } from 'react-router';
const Account = React.lazy(() =>
  import('./account').then((module) => ({ default: module.Account })),
);
const PublicProfile = React.lazy(() =>
  import('./account').then((module) => ({ default: module.PublicProfile })),
);
const Operator = React.lazy(() =>
  import('./operator').then((module) => ({ default: module.Operator })),
);
const Online = React.lazy(() => import('./online').then((module) => ({ default: module.Online })));
const Coach = React.lazy(() => import('./coach').then((module) => ({ default: module.Coach })));
const Policy = React.lazy(() => import('./policy').then((module) => ({ default: module.Policy })));

function HandleProfile() {
  const { handle } = useParams();
  return handle && /^@[a-zA-Z0-9_]{3,24}$/.test(handle) ? <PublicProfile /> : <NotFound />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <React.Suspense
        fallback={
          <p role="status" className="p-8">
            Ludus…
          </p>
        }
      >
        <Routes>
          <Route path="/account" element={<Account />} />
          <Route path="/terms" element={<Policy />} />
          <Route path="/privacy" element={<Policy />} />
          <Route path="/players/:username" element={<PublicProfile />} />
          <Route path="/:handle" element={<HandleProfile />} />
          <Route path="/operator" element={<Operator />} />
          <Route path="/online" element={<Online />} />
          <Route path="/coach/:matchId" element={<Coach />} />
          <Route path="/" element={<App />} />
          <Route path="/play" element={<Play />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
