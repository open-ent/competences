import { Alert, Button, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { getEleves } from '../api';
import { ClasseSelect, PeriodeSelect, StructureSelect } from '../features/Filters';
import {
  classesWithDevoirs,
  EMPTY_SEARCH,
  filterDevoirs,
  formatDate,
  isChefEtabOrHeadTeacher,
  isNotDone,
  isValidClasse,
  isValidDevoir,
  periodesWithDevoirs,
  sortDevoirs,
  Viewer,
} from '../rules';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Classe, Devoir, Eleve } from '../types';

type NamedDevoir = Devoir & { nameClass: string };

/**
 * Accueil de l'enseignant (`eval_acu_teacher.html`) : recherche d'un élève, évaluations par
 * classe, évaluations non terminées. Le graphique d'avancement par classe n'est pas repris :
 * il était désactivé dans l'AngularJS (`ng-if="false"`).
 */
export function TeacherHome() {
  const { t } = useTranslation(['competences', 'common']);
  const navigate = useNavigate();
  const { structures, rights, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) {
    return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  }

  return (
    <div className="d-flex flex-column gap-24">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-16">
        <h1 className="h3 mb-0">{t('home')}</h1>
        <div className="d-flex flex-wrap align-items-end gap-16">
          <StructureSelect />
          {rights.canCreateEval && (
            <Button color="primary" variant="filled" onClick={() => navigate('/devoir/create')}>
              {t('evaluations.evaluation.create')}
            </Button>
          )}
        </div>
      </div>

      {data.isError && <Alert type="danger">{t('competences.react.loading.error')}</Alert>}

      {rights.accessSuiviEleve && viewer && <StudentSearch classes={data.classes} />}

      {rights.canCreateEval &&
        (data.isLoading || !viewer ? (
          <LoadingScreen position={false} />
        ) : (
          <HomeWidgets viewer={viewer} classes={data.classes} devoirs={data.devoirs} periodes={data.periodes} />
        ))}
    </div>
  );
}

function HomeWidgets({
  viewer,
  classes,
  devoirs,
  periodes,
}: {
  viewer: Viewer;
  classes: Classe[];
  devoirs: Devoir[];
  periodes: ReturnType<typeof useStructureData>['periodes'];
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [classe, setClasse] = useState<string | null>(null);
  const [periode, setPeriode] = useState<number | null>(null);
  const chef = isChefEtabOrHeadTeacher(viewer);

  // Évaluations que l'usager peut voir, avec le nom de leur classe (`filteredDevoirs`).
  const visible = useMemo<NamedDevoir[]>(
    () =>
      devoirs
        .filter((d) => isValidDevoir(d, classes, viewer))
        .map((d) => ({ ...d, nameClass: classes.find((c) => c.id === d.id_groupe)?.name ?? '' })),
    [devoirs, classes, viewer],
  );

  // Classes proposées : celles où il évalue (`filterValidClasse`) ET qui ont une évaluation.
  const classOptions = useMemo(() => {
    const valid = classes.filter((c) => isValidClasse(c.id, undefined, classes, viewer));
    return classesWithDevoirs(valid, devoirs, viewer);
  }, [classes, devoirs, viewer]);

  const periodeOptions = useMemo(() => periodesWithDevoirs(periodes, devoirs, classe), [periodes, devoirs, classe]);

  const byClasse = sortDevoirs(filterDevoirs(visible, { ...EMPTY_SEARCH, classe, periode }));
  const notDone = sortDevoirs(visible.filter(isNotDone));

  return (
    <div className="row g-24">
      <section className="col-12 col-lg-6">
        <div className="card h-100 p-16">
          <h2 className="h5">{t(chef ? 'evaluations.evaluations.par.classe' : 'evaluations.mes.evaluations.par.classe')}</h2>
          <div className="d-flex flex-wrap gap-12 mb-12">
            <PeriodeSelect
              className="flex-fill"
              label={t('viescolaire.utils.periode')}
              periodes={periodeOptions}
              value={periode}
              onChange={setPeriode}
            />
            <ClasseSelect
              className="flex-fill"
              label={t('viescolaire.utils.class.groupe')}
              emptyLabel={t('competences.react.all.classes')}
              classes={classOptions}
              value={classe}
              onChange={(value) => {
                setClasse(value);
                setPeriode(null);
              }}
            />
          </div>
          <DevoirTable devoirs={byClasse} />
        </div>
      </section>

      <section className="col-12 col-lg-6">
        <div className="card h-100 p-16">
          <h2 className="h5">{t(chef ? 'evaluations.evaluations.non.terminees' : 'evaluations.mes.evaluations.non.terminees')}</h2>
          <DevoirTable devoirs={notDone} />
        </div>
      </section>
    </div>
  );
}

/** Tableau date / évaluation / classe, chaque ligne ouvrant la saisie de l'évaluation. */
function DevoirTable({ devoirs }: { devoirs: NamedDevoir[] }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  if (devoirs.length === 0) {
    return <p className="text-muted mb-0">{t('competences.react.devoirs.none.filtered')}</p>;
  }
  return (
    <div className="competences-scroll">
      <table className="table table-hover mb-0">
        <thead>
          <tr>
            <th scope="col">{t('date')}</th>
            <th scope="col">{t('viescolaire.notes.title')}</th>
            <th scope="col">{t('viescolaire.utils.class')}</th>
          </tr>
        </thead>
        <tbody>
          {devoirs.map((d) => (
            <tr key={d.id}>
              <td className="text-nowrap">{formatDate(d.date)}</td>
              <td>
                <Link to={`/devoir/${d.id}`}>{d.name}</Link>
              </td>
              <td>{d.nameClass}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Recherche d'un élève, qui ouvre son suivi (`openSuiviEleve`). Comme l'AngularJS, un enseignant
 * ne cherche que parmi les élèves de ses classes, un personnel d'éducation dans tout
 * l'établissement — et un autre profil n'a pas de liste.
 */
function StudentSearch({ classes }: { classes: Classe[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const { user } = useEdificeClient();
  const { structureId } = useStructure();
  const navigate = useNavigate();
  const id = useId();
  const [term, setTerm] = useState('');

  const scope = user?.type === 'ENSEIGNANT' ? 'teacher' : user?.type === 'PERSEDUCNAT' ? 'all' : null;
  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const elevesQuery = useQuery({
    queryKey: ['competences', structureId, 'eleves', scope, classIds],
    queryFn: () => getEleves(structureId, scope === 'teacher' ? classIds : undefined),
    enabled: !!structureId && scope !== null && (scope === 'all' || classIds.length > 0),
  });

  const needle = normalize(term.trim());
  const matches = needle.length < 2 ? [] : (elevesQuery.data ?? []).filter((e) => normalize(nameOf(e)).includes(needle)).slice(0, 10);

  const open = (eleve: Eleve) => {
    const params = new URLSearchParams({ idEleve: eleve.id, idClasse: eleve.idClasse });
    navigate(`/competences/eleve?${params}`);
  };

  return (
    <section>
      <label htmlFor={id} className="form-label h5">
        {t('viescolaire.eleve.recherche')}
      </label>
      <input
        id={id}
        type="search"
        className="form-control"
        autoComplete="off"
        placeholder={t('competences.react.search.student.placeholder')}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      {needle.length >= 2 && (
        <ul className="list-group competences-suggestions mt-4">
          {matches.length === 0 && <li className="list-group-item text-muted">{t('competences.react.search.student.none')}</li>}
          {matches.map((e) => (
            <li key={`${e.id}-${e.idClasse}`} className="list-group-item list-group-item-action p-0">
              <button type="button" className="btn btn-link w-100 text-start" onClick={() => open(e)}>
                {nameOf(e)}
                <span className="text-muted ms-8">{classes.find((c) => c.id === e.idClasse)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const nameOf = (e: Eleve) => e.displayName ?? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim();

/** Recherche insensible à la casse et aux accents (« eloise » trouve « Éloïse »). */
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default TeacherHome;
