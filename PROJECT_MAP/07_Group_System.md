# Box 7: Group System

## Core Mechanics
1. **Creation:** User creates a group, becoming the "Admin/Owner".
2. **Key Generation:** A unique 6-digit alphanumerical `invite_code` is returned.
3. **Distribution:** The code is shared to invitees using the Web Share API if possible, or via copy-paste.
4. **Joining:** A member clicks "Join a Group", inputs the 6-digit code. They are inserted into `group_members`.
5. **Twilio Number Assignment:** The created group is assigned a Twilio SMS Number (or relies on a shared pool). This number is explicitly shown to all members so they save it.

## Permissions & Scope
- **Owner Roles (Admin):** Only the group creator can delete the group or set an alarm for the group, or send manual nudge push notifications to sleeping members.
- **Member Roles:** Members can only view the group, see active alarms, and leave the group.
