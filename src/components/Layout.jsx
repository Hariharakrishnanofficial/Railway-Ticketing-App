/**
 * Layout.jsx — backward-compatibility shim.
 * The new system uses AdminLayout / PassengerLayout directly from App.jsx.
 * This file is kept so existing page imports don't break.
 * It simply renders AdminLayout or PassengerLayout based on the user's role.
 */

import AdminLayout     from './AdminLayout';
import PassengerLayout from './PassengerLayout';
import { isAdmin }     from '../services/api';

export default function Layout({ children, user, onLogin, onLogout }) {
  if (isAdmin(user)) {
    return <AdminLayout user={user} onLogout={onLogout}>{children}</AdminLayout>;
  }
  return <PassengerLayout user={user} onLogout={onLogout}>{children}</PassengerLayout>;
}
