import PocketBase from 'pocketbase';

// Runtime'da window.location.origin kullanılır — bu sayede Nginx proxy
// üzerinden hangi domain/portta çalışırsa çalışsın PocketBase'e ulaşır.
// VITE_PB_URL yalnızca local dev için .env'de 127.0.0.1:8090 olarak bırakılabilir.
const pb = new PocketBase(import.meta.env.VITE_PB_URL || window.location.origin);
pb.autoCancellation(false);

export default pb;
