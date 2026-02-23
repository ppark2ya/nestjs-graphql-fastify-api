import { ApolloProvider } from '@apollo/client/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { client } from './apollo';
import Navigation from './components/Navigation';
import LiveStreamPage from './pages/LiveStreamPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <ApolloProvider client={client}>
      <BrowserRouter>
        <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
          <Navigation />
          <Routes>
            <Route path="/" element={<LiveStreamPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ApolloProvider>
  );
}
