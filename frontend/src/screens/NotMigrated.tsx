import { Button, EmptyScreen } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import illustration from '@images/emptyscreen/illu-homeworks.svg';

/**
 * Écran de relais pour les parties du module qui ne sont pas encore portées : saisie des notes
 * et des compétences, création d'une évaluation, relevé, suivis, conseil de classe, exports,
 * bulletins.
 *
 * Il renvoie vers l'IHM AngularJS **en conservant le chemin demandé** et sa requête, les deux
 * interfaces partageant leurs routes : `#/competences/eleve?idEleve=…&idClasse=…` ouvre bien le
 * suivi de cet élève de l'autre côté. La dérogation `?ui=angular` n'est PAS mémorisée.
 *
 * Le départ demande un CLIC : une redirection automatique n'aurait laissé qu'un éclair à l'écran,
 * et l'usager aurait changé d'interface sans comprendre pourquoi.
 */
export function NotMigrated() {
  const { t } = useTranslation(['competences', 'common']);
  const location = useLocation();
  const target = `/competences?ui=angular#${location.pathname}${location.search}`;

  return (
    <div className="d-flex flex-column align-items-center gap-16 mt-24">
      <EmptyScreen
        imageSrc={illustration}
        title={t('competences.switch.notmigrated.title')}
        text={t('competences.switch.notmigrated.text')}
        size={200}
      />
      <Button color="primary" variant="filled" onClick={() => (window.location.href = target)}>
        {t('competences.switch.notmigrated.action')}
      </Button>
    </div>
  );
}

export default NotMigrated;
