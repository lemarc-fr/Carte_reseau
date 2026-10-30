import Dashboard from '@/components/Dashboard';
import { PreloadResources } from './PreloadResources';

export default function Page() {
  return (
    <>
      <PreloadResources />
      <Dashboard />
    </>
  );
}
