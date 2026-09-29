import { Redirect } from 'expo-router';

/** Qualsiasi indirizzo sconosciuto riporta alla libreria. */
export default function NotFound() {
  return <Redirect href="/" />;
}
