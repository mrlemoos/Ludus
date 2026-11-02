import { policyVersion } from '../shared/profile';
import { type Language, isLanguage } from '../shared/waitlist';
import { Header } from './app';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

type Section = { title: string; paragraphs: string[] };
const policies: Record<
  Language,
  Record<'terms' | 'privacy', { title: string; sections: Section[] }>
> = {
  'en-GB': {
    terms: {
      title: 'Terms of service',
      sections: [
        {
          title: 'Using Ludus',
          paragraphs: [
            'Ludus is an adults-only chess service. You need an account to play. Keep your sign-in link private and use the service lawfully.',
            'Chess games, rankings and activity are provided for play and entertainment. Coach reviews are educational explanations, not a promise of a correct result or professional advice.',
          ],
        },
        {
          title: 'Coach reviews and credits',
          paragraphs: [
            'Stockfish analysis in your browser is free and unlimited. An AI-written coach review uses one review credit only when generation succeeds. A failed or unavailable generation does not use a credit.',
            'Each account receives one introductory AI review for life. Accounts receive 30 free review credits each month until the expiry of their original beta period. Accounts with an explicit complimentary grant continue to receive 30 monthly credits after beta. Monthly credits expire at the end of their month. Ludus uses the introductory review first, then beta or granted monthly credits, then paid credits.',
            'A paid pack contains 10 AI coach reviews for €4.99. Paid credits do not expire. Changing your interface language does not regenerate or charge for a saved review. Saved reviews remain available without charge.',
            'Each saved review allows up to five successfully generated follow-up answers. Failed answers do not count. Saved answers remain available if coaching is unavailable.',
          ],
        },
        {
          title: 'Payment and refunds',
          paragraphs: [
            'Payment is handled on Stripe’s hosted checkout page. Ludus does not receive your full card number. A pack is credited only after Stripe confirms payment. Purchases will remain unavailable until billing, tax and account checks are complete.',
            'Unused paid packs are refunded on request. Refunds are processed manually. Requests for partly used packs are reviewed individually. These terms do not limit any mandatory consumer rights that apply to you. An open payment dispute freezes the unused credits from the affected pack while it is reviewed.',
          ],
        },
        {
          title: 'Changes and availability',
          paragraphs: [
            'Ludus may change or pause features for maintenance, safety or legal reasons. We will not remove a saved review because you change language or your free monthly allowance ends.',
          ],
        },
      ],
    },
    privacy: {
      title: 'Privacy notice',
      sections: [
        {
          title: 'Data Ludus keeps',
          paragraphs: [
            'Ludus stores your email for sign-in, account settings, language and timezone, chess games and results, and private coach reviews and conversations. Your public profile shows your username, rank and activity settings. You can hide your activity grid.',
            'For each AI review, Ludus selects the finished game you opened and up to three preceding finished games. Stockfish analyses those games in your browser where possible. If a game or its analysis is unavailable, Ludus records the gap and can still request a review of the current game.',
          ],
        },
        {
          title: 'AI coaching',
          paragraphs: [
            'To write a review or follow-up, Ludus sends the relevant moves, result, player colour, browser engine analysis, selected teaching profile and language, and any question or short conversation context to its server and an external AI model provider. The current game and up to three preceding finished games may be included. Missing games or analyses are identified as gaps.',
            'Ludus does not send your email, username, account ID or match ID to the AI provider. Reviews and conversations are saved to your private account. Changing language affects future responses only; saved text stays in the language in which it was generated.',
          ],
        },
        {
          title: 'Payments and service providers',
          paragraphs: [
            'Stripe hosts the payment page and processes card details. Ludus stores payment identifiers and credit balances for fulfilment, refunds, disputes and accounting. It does not store your full card number.',
            'Ludus uses Cloudflare to host the service and its database. Authentication email is delivered through Resend. These providers process data needed to provide their services.',
          ],
        },
        {
          title: 'Retention and your choices',
          paragraphs: [
            'You can make your activity private in account settings and request account deletion from the same page. Deletion removes private reviews and profile data and anonymises retained match records. Some payment and security records may remain where needed for legal obligations, dispute handling or abuse prevention.',
            'Uninvited waitlist records expire after 180 days. Invitation delivery metadata is kept for 30 days and abuse reports for 90 days. Ludus does not use your email for marketing.',
          ],
        },
        {
          title: 'Open disclosures',
          paragraphs: [
            'Before paid checkout is enabled, Ludus will publish the controller’s registered identity and address, a contact channel for privacy and refund requests, and the exact retention period for payment records. The AI model provider and its data-retention terms will be named before paid coaching is enabled. Stripe’s Dashboard terms and privacy URLs must point to these pages.',
          ],
        },
      ],
    },
  },
  'es-ES': {
    terms: {
      title: 'Condiciones del servicio',
      sections: [
        {
          title: 'Uso de Ludus',
          paragraphs: [
            'Ludus es un servicio de ajedrez para adultos. Necesitas una cuenta para jugar. Mantén privado tu enlace de acceso y utiliza el servicio de forma legal.',
            'Las partidas, clasificaciones y estadísticas sirven para jugar y entretenerse. Los análisis del entrenador tienen fines educativos y no garantizan un resultado correcto ni constituyen asesoramiento profesional.',
          ],
        },
        {
          title: 'Análisis y créditos',
          paragraphs: [
            'El análisis de Stockfish en tu navegador es gratuito e ilimitado. Un análisis redactado por IA consume un crédito solo cuando se genera correctamente. Los intentos fallidos o el servicio no disponible no consumen créditos.',
            'Cada cuenta recibe un análisis de IA de bienvenida para siempre. Durante el periodo de beta original, recibes 30 créditos mensuales gratuitos. Después, solo las cuentas con una concesión de cortesía explícita conservan 30 créditos mensuales. Los créditos mensuales caducan al final de cada mes. Se usan primero los créditos de bienvenida, después los de beta o de cortesía concedida y, por último, los comprados.',
            'El paquete comprado incluye 10 análisis del entrenador por 4,99 €. Los créditos comprados no caducan. Cambiar el idioma de la interfaz no vuelve a generar ni cobra un análisis guardado. Los análisis guardados siguen disponibles sin coste.',
            'Cada análisis guardado permite hasta cinco respuestas de seguimiento generadas correctamente. Las respuestas fallidas no cuentan. Las respuestas guardadas siguen disponibles aunque el entrenador no esté disponible.',
          ],
        },
        {
          title: 'Pagos y devoluciones',
          paragraphs: [
            'El pago se realiza en la página segura de Stripe. Ludus no recibe el número completo de tu tarjeta. Los créditos se añaden solo después de que Stripe confirme el pago. Las compras no estarán disponibles hasta completar las comprobaciones de facturación, impuestos y cuenta.',
            'Los paquetes pagados sin usar se devuelven si lo solicitas. Las devoluciones se tramitan manualmente. Las solicitudes para paquetes usados parcialmente se revisan de forma individual. Estas condiciones no limitan los derechos obligatorios de consumidores que te correspondan. Una disputa de pago abierta congela los créditos sin usar del paquete afectado mientras se revisa.',
          ],
        },
        {
          title: 'Cambios y disponibilidad',
          paragraphs: [
            'Ludus puede cambiar o pausar funciones por mantenimiento, seguridad o motivos legales. No eliminaremos un análisis guardado porque cambies de idioma o se agote tu saldo mensual gratuito.',
          ],
        },
      ],
    },
    privacy: {
      title: 'Aviso de privacidad',
      sections: [
        {
          title: 'Datos que conserva Ludus',
          paragraphs: [
            'Ludus guarda tu correo para iniciar sesión, los ajustes de cuenta, idioma y zona horaria, las partidas y sus resultados, y los análisis y conversaciones privadas. Tu perfil público muestra tu nombre, clasificación y ajustes de actividad. Puedes ocultar tu actividad.',
            'Cada análisis con IA usa la partida terminada que has abierto y hasta tres partidas terminadas anteriores. Cuando es posible, Stockfish las analiza en tu navegador. Si falta una partida o su análisis, Ludus registra esa ausencia y puede solicitar el análisis de la partida actual.',
          ],
        },
        {
          title: 'Entrenamiento con IA',
          paragraphs: [
            'Para redactar un análisis o una respuesta, Ludus envía al servidor y a un proveedor externo de IA las jugadas pertinentes, el resultado, tu color, el análisis del motor del navegador, el perfil de enseñanza y el idioma elegidos, y la pregunta o parte breve de la conversación. Puede incluirse la partida actual y hasta tres partidas terminadas anteriores. Las partidas o análisis ausentes se indican como datos faltantes.',
            'Ludus no envía al proveedor de IA tu correo, nombre de usuario, ID de cuenta ni ID de partida. Los análisis y conversaciones se guardan en tu cuenta privada. Cambiar de idioma solo afecta a respuestas futuras; el texto guardado conserva el idioma de generación. El proveedor del modelo y sus condiciones de conservación se publicarán antes de activar el coaching con IA.',
          ],
        },
        {
          title: 'Pagos y proveedores',
          paragraphs: [
            'Stripe aloja la página de pago y procesa los datos de tarjeta. Ludus guarda identificadores de pago y saldos de créditos para entregar compras, gestionar devoluciones, disputas y contabilidad. No guarda el número completo de tu tarjeta.',
            'Cloudflare aloja el servicio y su base de datos. Resend entrega los correos de autenticación. Estos proveedores procesan los datos necesarios para prestar sus servicios.',
          ],
        },
        {
          title: 'Conservación y opciones',
          paragraphs: [
            'Puedes ocultar tu actividad desde los ajustes y solicitar la eliminación de la cuenta desde esa misma página. La eliminación borra los análisis privados y los datos del perfil, y anonimiza las partidas conservadas. Algunos datos de pago y seguridad pueden conservarse cuando sean necesarios por obligaciones legales, disputas o prevención del abuso.',
            'Las inscripciones a la lista de espera sin invitación caducan a los 180 días. Los datos de envío de invitaciones se conservan 30 días y los informes de abuso, 90 días. Ludus no usa tu correo para publicidad.',
          ],
        },
        {
          title: 'Información pendiente',
          paragraphs: [
            'Antes de activar los pagos se publicarán la identidad y dirección registradas del responsable, un contacto para solicitudes de privacidad y devoluciones y el plazo exacto de conservación de los datos de pago. También se indicarán el proveedor del modelo de IA y sus condiciones de conservación antes de activar el coaching de pago. Las URL de condiciones y privacidad de Stripe apuntarán a estas páginas.',
          ],
        },
      ],
    },
  },
  'fr-FR': {
    terms: {
      title: 'Conditions d’utilisation',
      sections: [
        {
          title: 'Utiliser Ludus',
          paragraphs: [
            'Ludus est un service d’échecs réservé aux adultes. Un compte est nécessaire pour jouer. Gardez votre lien de connexion privé et utilisez le service conformément à la loi.',
            'Les parties, classements et activités sont proposés pour jouer et se divertir. Les analyses du coach ont un but pédagogique. Elles ne garantissent pas un résultat exact et ne constituent pas un conseil professionnel.',
          ],
        },
        {
          title: 'Analyses et crédits',
          paragraphs: [
            'L’analyse Stockfish dans votre navigateur est gratuite et illimitée. Une analyse rédigée par IA utilise un crédit uniquement si sa génération aboutit. Une génération échouée ou indisponible ne consomme pas de crédit.',
            'Chaque compte reçoit une analyse IA de bienvenue à vie. Pendant la période bêta initiale, vous recevez 30 crédits gratuits par mois. Ensuite, seuls les comptes bénéficiant d’une attribution offerte explicite conservent 30 crédits mensuels. Les crédits mensuels expirent à la fin du mois. Les crédits de bienvenue sont utilisés en premier, puis les crédits bêta ou attribués, et enfin les crédits payés.',
            'Un pack payant contient 10 analyses du coach pour 4,99 €. Les crédits payés n’expirent pas. Changer la langue de l’interface ne relance pas et ne facture pas une analyse enregistrée. Les analyses enregistrées restent accessibles gratuitement.',
            'Chaque analyse enregistrée permet jusqu’à cinq réponses de suivi générées avec succès. Les réponses échouées ne comptent pas. Les réponses enregistrées restent accessibles si le coach est indisponible.',
          ],
        },
        {
          title: 'Paiements et remboursements',
          paragraphs: [
            'Le paiement est effectué sur la page hébergée par Stripe. Ludus ne reçoit pas le numéro complet de votre carte. Le pack est crédité après confirmation du paiement par Stripe. Les achats resteront indisponibles jusqu’à la validation des contrôles de facturation, de fiscalité et du compte.',
            'Les packs payés non utilisés sont remboursés sur demande. Les remboursements sont traités manuellement. Les demandes concernant un pack partiellement utilisé sont examinées au cas par cas. Ces conditions ne limitent aucun droit obligatoire dont vous bénéficiez en tant que consommateur. Un litige de paiement ouvert gèle les crédits inutilisés du pack concerné pendant son examen.',
          ],
        },
        {
          title: 'Modifications et disponibilité',
          paragraphs: [
            'Ludus peut modifier ou suspendre des fonctions pour maintenance, sécurité ou raisons légales. Une analyse enregistrée ne sera pas supprimée si vous changez de langue ou si votre solde mensuel gratuit est épuisé.',
          ],
        },
      ],
    },
    privacy: {
      title: 'Notice de confidentialité',
      sections: [
        {
          title: 'Données conservées par Ludus',
          paragraphs: [
            'Ludus conserve votre e-mail de connexion, les paramètres du compte, la langue et le fuseau horaire, les parties et leurs résultats, ainsi que les analyses et conversations privées. Votre profil public affiche votre pseudo, votre classement et vos paramètres d’activité. Vous pouvez masquer votre activité.',
            'Chaque analyse IA utilise la partie terminée ouverte et jusqu’à trois parties terminées précédentes. Stockfish les analyse dans votre navigateur lorsque c’est possible. Si une partie ou son analyse est indisponible, Ludus signale cette absence et peut tout de même demander une analyse de la partie actuelle.',
          ],
        },
        {
          title: 'Coaching par IA',
          paragraphs: [
            'Pour rédiger une analyse ou une réponse, Ludus envoie au serveur et à un fournisseur externe d’IA les coups concernés, le résultat, votre couleur, l’analyse du moteur dans le navigateur, le profil pédagogique et la langue choisis, ainsi que votre question ou un court contexte de conversation. La partie actuelle et jusqu’à trois parties terminées précédentes peuvent être incluses. Les parties ou analyses manquantes sont signalées.',
            'Ludus n’envoie pas au fournisseur d’IA votre e-mail, pseudo, identifiant de compte ou identifiant de partie. Les analyses et conversations sont enregistrées dans votre compte privé. Le changement de langue ne concerne que les réponses futures ; le texte enregistré garde sa langue de génération. Le fournisseur IA et ses conditions de conservation seront publiés avant l’activation du coaching IA.',
          ],
        },
        {
          title: 'Paiements et prestataires',
          paragraphs: [
            'Stripe héberge la page de paiement et traite les données de carte. Ludus conserve les identifiants de paiement et les soldes de crédits pour livrer les achats, traiter les remboursements, litiges et obligations comptables. Ludus ne conserve pas le numéro complet de votre carte.',
            'Cloudflare héberge le service et sa base de données. Resend envoie les e-mails d’authentification. Ces prestataires traitent les données nécessaires à leurs services.',
          ],
        },
        {
          title: 'Conservation et choix',
          paragraphs: [
            'Vous pouvez masquer votre activité dans les paramètres et demander la suppression de votre compte depuis la même page. La suppression efface les analyses privées et les données du profil, et anonymise les parties conservées. Certaines données de paiement et de sécurité peuvent être conservées si nécessaire pour respecter la loi, traiter un litige ou prévenir les abus.',
            'Les inscriptions non invitées à la liste d’attente expirent après 180 jours. Les données d’envoi des invitations sont conservées 30 jours et les signalements d’abus 90 jours. Ludus n’utilise pas votre e-mail à des fins publicitaires.',
          ],
        },
        {
          title: 'Informations à publier',
          paragraphs: [
            'Avant l’activation des paiements, Ludus publiera l’identité et l’adresse enregistrées du responsable, un contact pour les demandes de confidentialité et de remboursement, ainsi que la durée exacte de conservation des données de paiement. Le fournisseur du modèle IA et ses conditions de conservation seront indiqués avant l’activation du coaching payant. Les URL Stripe des conditions et de confidentialité pointeront vers ces pages.',
          ],
        },
      ],
    },
  },
};

export function Policy() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'en-GB';
  const policy = policies[language][pathname === '/privacy' ? 'privacy' : 'terms'];
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${policyVersion}T00:00:00Z`),
  );
  const updated =
    language === 'es-ES'
      ? `Última actualización: ${date}`
      : language === 'fr-FR'
        ? `Dernière mise à jour : ${date}`
        : `Last updated: ${date}`;
  return (
    <div className="site-shell profile-page">
      <Header />
      <main className="profile-main policy-page">
        <nav className="profile-navigation">
          <Link to="/account">
            {language === 'es-ES' ? 'Cuenta' : language === 'fr-FR' ? 'Compte' : 'Account'}
          </Link>
          <Link to={pathname === '/privacy' ? '/terms' : '/privacy'}>
            {pathname === '/privacy'
              ? language === 'es-ES'
                ? 'Condiciones'
                : language === 'fr-FR'
                  ? 'Conditions'
                  : 'Terms'
              : language === 'es-ES'
                ? 'Privacidad'
                : language === 'fr-FR'
                  ? 'Confidentialité'
                  : 'Privacy'}
          </Link>
        </nav>
        <p className="profile-eyebrow">Ludus</p>
        <h1>{policy.title}</h1>
        <p className="policy-updated">{updated}</p>
        {policy.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
