import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import AboutPage from "@/pages/AboutPage";
import CreateTaskPage from "@/pages/CreateTask";
import EditTaskPage from "@/pages/EditTaskPage";
import HistoryPage from "@/pages/HistoryPage";
import HomePage from "@/pages/HomePage";
import SentenceExplanationPage from "@/pages/SentenceExplanationPage";
import SentenceExplanationVideoPage from "@/pages/SentenceExplanationVideoPage";
import TaskExecutionPage from "@/pages/TaskExecution";
import TaskResultsPage from "@/pages/TaskResults";
import NotFound from "@/pages/NotFound";
import TextTransferPage from "@/pages/TextTransferPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<CreateTaskPage />} />
            <Route path="/sentence-agent" element={<CreateTaskPage />} />
            <Route path="/create-task" element={<CreateTaskPage />} />
            <Route path="/edit/:taskId" element={<EditTaskPage />} />
            <Route path="/task/:taskId" element={<TaskExecutionPage />} />
            <Route path="/explanation/:taskId" element={<SentenceExplanationPage />} />
            <Route path="/explanation/:taskId/video" element={<SentenceExplanationVideoPage />} />
            <Route path="/result/:taskId" element={<TaskResultsPage />} />
            <Route path="/text-transfer" element={<TextTransferPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
