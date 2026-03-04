import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          페이지를 찾을 수 없습니다
        </p>
        <Button asChild className="mt-8">
          <Link to="/admin/login">홈으로 돌아가기</Link>
        </Button>
      </div>
    </div>
  );
}
