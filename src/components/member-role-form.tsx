"use client";

import { useState } from "react";
import { changeMember } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const roles = [
  { value: "admin", label: "Administrador" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Lector" },
  { value: "remove", label: "Retirar del espacio" },
];

export function MemberRoleForm({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: string }) {
  const [selectedRole, setSelectedRole] = useState(role);
  return <form action={changeMember} className="flex items-end gap-2">
    <input type="hidden" name="workspace_id" value={workspaceId} />
    <input type="hidden" name="user_id" value={userId} />
    <input type="hidden" name="role" value={selectedRole} />
    <Field><FieldLabel htmlFor={`member-role-${userId}`} className="sr-only">Nuevo rol</FieldLabel><Select value={selectedRole} onValueChange={(value) => value && setSelectedRole(value)} items={roles}><SelectTrigger id={`member-role-${userId}`} size="sm" className="w-42"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{roles.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Button type="submit" size="sm" variant="outline">Aplicar</Button>
  </form>;
}
