import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './i18n';
import './styles.css';
import './profile.css';
import { App, NotFound } from './App';
import { Play } from './Play';
const Account = React.lazy(() => import('./Account').then((module) => ({ default: module.Account })));
const PublicProfile = React.lazy(() => import('./Account').then((module) => ({ default: module.PublicProfile })));
const Operator = React.lazy(() => import('./Operator').then((module) => ({ default: module.Operator })));
const Online = React.lazy(() => import('./Online').then((module) => ({ default: module.Online })));
const Coach = React.lazy(() => import('./Coach').then((module) => ({ default: module.Coach })));


function HandleProfile() {
  const { handle } = useParams();
  return handle && /^@[a-zA-Z0-9_]{3,24}$/.test(handle) ? <PublicProfile /> : <NotFound />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <React.Suspense fallback={<p role="status" className="p-8">Ludus…</p>}><Routes><Route path="/account" element={<Account />} /><Route path="/players/:username" element={<PublicProfile />} /><Route path="/:handle" element={<HandleProfile />} /><Route path="/operator" element={<Operator />} /><Route path="/online" element={<Online />} /><Route path="/coach/:matchId" element={<Coach />} /><Route path="/" element={<App />} /><Route path="/play" element={<Play />} /><Route path="*" element={<NotFound />} /></Routes></React.Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
