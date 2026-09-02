/** In-portal 404. Always offers a way back — no dead ends. */
import { useNavigate } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';

export default function NotFoundPage({ portal = 'customer' }) {
  const navigate = useNavigate();
  const home = portal === 'admin' ? '/admin' : '/app';

  return (
    <Card>
      <CardBody className="flex flex-col items-center py-16 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Compass className="h-7 w-7 text-slate-400" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">This page does not exist</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          The link may be out of date, or the record may have been removed.
        </p>
        <Button className="mt-6" icon={Home} onClick={() => navigate(home)}>
          Back to dashboard
        </Button>
      </CardBody>
    </Card>
  );
}
