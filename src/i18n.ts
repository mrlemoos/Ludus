import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isLanguage, type Language } from '../shared/waitlist';

const en = {
  pageTitle: 'Ludus | A seat at the table',
  description: '3D chess in a Madrid-inspired café, with a coach to help you learn after each game. Join the invite-only beta waitlist.',
  skip: 'Skip to content',
  language: 'Language',
  beta: 'An invitation to play',
  location: 'Inspired by Madrid',
  headline: 'A seat at',
  headlineItalic: 'the table.',
  intro: 'A quiet café. A worthy opponent. A game worth coming back to.',
  detail: 'Play chess in 3D, challenge a friend or the computer, then work through your game with a coach who speaks your language.',
  waitlist: 'Join the beta waitlist',
  email: 'Email address',
  placeholder: 'you@example.com',
  submit: 'Save my seat',
  pending: 'Saving your seat…',
  note: 'Invitations sent in small batches. For players aged 18 and over.',
  preference: 'Your invitation language: {{language}}.',
  privacy: 'We’ll use your email for beta access. No marketing list.',
  successTitle: 'Your seat is on the list.',
  success: 'We’ll email you when there’s room at the table. Already joined? You’re still on the list.',
  invalid: 'Enter a valid email address to join.',
  limited: 'Too many attempts. Wait a minute, then try again.',
  unavailable: 'Your seat couldn’t be saved. Please try again.',
  boardCaption: 'The next move is yours.',
  boardSub: 'A chess café, wherever you are.',
  playTitle: 'Make yourself at home.',
  play: 'A traditional wooden set in a café inspired by central Madrid. Switch to 2D whenever you prefer.',
  opponentsTitle: 'Good company. Good chess.',
  opponents: 'Invite a friend, meet an online opponent or find your pace against four computer levels.',
  coachTitle: 'Play first. Understand after.',
  coach: 'A move-by-move replay and a coach who explains the why. Coaching starts only when your game ends.',
  trial: 'Beta players get 30 days of Plus. No card needed.',
  footer: 'Made for the love of the game.',
  soon: 'Invite-only beta · Coming soon',
  notFound: 'This table isn’t here.',
  home: 'Back to Ludus',
};
type Copy = { [Key in keyof typeof en]: string };

const es: Copy = {
  pageTitle: 'Ludus | Un sitio en la mesa',
  description: 'Ajedrez en 3D en un café inspirado en Madrid, con un entrenador para aprender después de cada partida. Apúntate a la beta por invitación.',
  skip: 'Saltar al contenido', language: 'Idioma', beta: 'Una invitación a jugar', location: 'Inspirado en Madrid',
  headline: 'Un sitio en', headlineItalic: 'la mesa.',
  intro: 'Un café tranquilo. Un buen rival. Una partida a la que volver.',
  detail: 'Juega al ajedrez en 3D, reta a un amigo o al ordenador y repasa tu partida con un entrenador que habla tu idioma.',
  waitlist: 'Apúntate a la lista de espera', email: 'Correo electrónico', placeholder: 'tu@ejemplo.es',
  submit: 'Reservar mi sitio', pending: 'Reservando tu sitio…',
  note: 'Enviamos invitaciones en pequeños grupos. Para mayores de 18 años.',
  preference: 'Idioma de tu invitación: {{language}}.', privacy: 'Usaremos tu correo para darte acceso a la beta. Sin publicidad.',
  successTitle: 'Ya estás en la lista.',
  success: 'Te escribiremos cuando haya sitio en la mesa. Si ya te habías apuntado, sigues en la lista.',
  invalid: 'Introduce un correo electrónico válido.', limited: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
  unavailable: 'No hemos podido guardar tu sitio. Vuelve a intentarlo.',
  boardCaption: 'El siguiente movimiento es tuyo.', boardSub: 'Tu café de ajedrez, estés donde estés.',
  playTitle: 'Siéntete como en casa.', play: 'Piezas de madera tradicionales en un café inspirado en el centro de Madrid. Cambia a 2D cuando prefieras.',
  opponentsTitle: 'Buena compañía. Buen ajedrez.', opponents: 'Invita a un amigo, encuentra un rival en línea o elige entre cuatro niveles del ordenador.',
  coachTitle: 'Primero juega. Después aprende.', coach: 'Repite la partida jugada a jugada con un entrenador que explica el porqué. El análisis empieza cuando termina tu partida.',
  trial: 'La beta incluye 30 días de Plus. Sin tarjeta.', footer: 'Por amor al ajedrez.', soon: 'Beta por invitación · Próximamente',
  notFound: 'Esta mesa no está aquí.', home: 'Volver a Ludus',
};

const fr: Copy = {
  pageTitle: 'Ludus | Une place à la table',
  description: 'Des échecs en 3D dans un café inspiré de Madrid, avec un coach pour apprendre après chaque partie. Rejoignez la liste d’attente de la bêta sur invitation.',
  skip: 'Aller au contenu', language: 'Langue', beta: 'Une invitation à jouer', location: 'Inspiré de Madrid',
  headline: 'Une place à', headlineItalic: 'la table.',
  intro: 'Un café tranquille. Un bel adversaire. Une partie qui donne envie de revenir.',
  detail: 'Jouez aux échecs en 3D, défiez un ami ou l’ordinateur, puis revenez sur votre partie avec un coach qui parle votre langue.',
  waitlist: 'Rejoindre la liste d’attente', email: 'Adresse e-mail', placeholder: 'vous@exemple.fr',
  submit: 'Réserver ma place', pending: 'Réservation en cours…',
  note: 'Invitations envoyées par petits groupes. Pour les personnes de 18 ans et plus.',
  preference: 'Langue de votre invitation : {{language}}.', privacy: 'Votre e-mail servira à l’accès à la bêta. Aucune publicité.',
  successTitle: 'Votre place est sur la liste.',
  success: 'Nous vous écrirons dès qu’une place se libérera. Déjà inscrit ? Vous êtes toujours sur la liste.',
  invalid: 'Saisissez une adresse e-mail valide.', limited: 'Trop de tentatives. Attendez une minute, puis réessayez.',
  unavailable: 'Votre place n’a pas pu être enregistrée. Veuillez réessayer.',
  boardCaption: 'À vous de jouer.', boardSub: 'Un café d’échecs, où que vous soyez.',
  playTitle: 'Faites comme chez vous.', play: 'Des pièces traditionnelles en bois dans un café inspiré du centre de Madrid. Passez en 2D quand vous le souhaitez.',
  opponentsTitle: 'De belles rencontres. De belles parties.', opponents: 'Invitez un ami, trouvez un adversaire en ligne ou choisissez parmi quatre niveaux de l’ordinateur.',
  coachTitle: 'Jouez d’abord. Comprenez ensuite.', coach: 'Revivez la partie coup par coup avec un coach qui explique le pourquoi. Le coaching commence après la fin de la partie.',
  trial: 'La bêta inclut 30 jours de Plus. Sans carte bancaire.', footer: 'Pour l’amour du jeu.', soon: 'Bêta sur invitation · Bientôt',
  notFound: 'Cette table n’est pas ici.', home: 'Retour à Ludus',
};

export const languageNames: Record<Language, string> = {
  'en-GB': 'English', 'es-ES': 'Español', 'fr-FR': 'Français',
};

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('ludus-language');
    if (isLanguage(saved)) return saved;
  } catch { /* Browser storage may be unavailable. */ }
  const preferred = navigator.languages?.[0] ?? navigator.language;
  if (preferred?.startsWith('es')) return 'es-ES';
  if (preferred?.startsWith('fr')) return 'fr-FR';
  return 'en-GB';
}

void i18n.use(initReactI18next).init({
  resources: { 'en-GB': { translation: en }, 'es-ES': { translation: es }, 'fr-FR': { translation: fr } },
  lng: initialLanguage(), fallbackLng: 'en-GB', supportedLngs: ['en-GB', 'es-ES', 'fr-FR'],
  interpolation: { escapeValue: false },
});

export default i18n;
