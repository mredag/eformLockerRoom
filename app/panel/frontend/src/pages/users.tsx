import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function Users() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage staff users and access permissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Users</CardTitle>
          <CardDescription>
            Create and manage staff user accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            User management interface will be implemented in a future task.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
