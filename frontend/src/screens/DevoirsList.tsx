import { Alert, Button, LoadingScreen } from '@open-ent/react';
import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ClasseSelect, PeriodeSelect, SimpleSelect, StructureSelect } from '../features/Filters';
import {
  canOpenDevoir,
  classesWithDevoirs,
  DevoirSearch,
  EMPTY_SEARCH,
  filterDevoirs,
  formatDate,
  isChefEtabOrHeadTeacher,
  isValidClasse,
  isValidDevoir,
  matieresForClasse,
  periodesWithDevoirs,
  sortDevoirs,
} from '../rules';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Devoir } from '../types';

/**
 * L'AngularJS affichait 22 lignes, puis 5 de plus à chaque arrivée en bas de liste (défilement
 * infini). Ici un bouton explicite en ajoute 22 : atteignable au clavier, et sans charger des
 * lignes que personne n'a demandées.
 */
const PAGE = 22;
const MORE = 22;

/**
 * Liste des évaluations (`display_devoirs_structure.html` + `list_view.html`) : critères, recherche
 * par nom, tableau dépliable. La sélection et ses actions (modifier, dupliquer, supprimer,
 * exporter) ne sont pas encore portées : elles restent dans la version précédente.
 */
export function DevoirsList() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const navigate = useNavigate();
  const { structureId, structures, rights, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const [search, setSearch] = useState<DevoirSearch>(EMPTY_SEARCH);
  const [limit, setLimit] = useState(PAGE);
  const [opened, setOpened] = useState<number | null>(null);
  const nameId = useId();

  // Changer d'établissement repart de critères vides (`changeEtablissement` → `initSearch`).
  useEffect(() => setSearch(EMPTY_SEARCH), [structureId]);
  // Un critère qui change ramène en tête de liste.
  useEffect(() => setLimit(PAGE), [search]);

  const { classes, devoirs, matieres, types, periodes, sousMatieres, enseignants } = data;

  const visible = useMemo(
    () =>
      viewer
        ? devoirs
            .filter((d) => isValidDevoir(d, classes, viewer))
            .map((d) => ({ ...d, nameClass: classes.find((c) => c.id === d.id_groupe)?.name ?? '' }))
        : [],
    [devoirs, classes, viewer],
  );
  const classOptions = useMemo(
    () => (viewer ? classesWithDevoirs(classes.filter((c) => isValidClasse(c.id, undefined, classes, viewer)), devoirs, viewer) : []),
    [classes, devoirs, viewer],
  );
  const matiereOptions = useMemo(() => {
    if (!viewer) return [];
    // `unique:'name'` : deux matières homonymes (codes différents) ne font qu'une entrée.
    const seen = new Set<string>();
    return matieresForClasse(matieres, search.classe, classes, viewer).filter((m) => !seen.has(m.name) && !!seen.add(m.name));
  }, [matieres, search.classe, classes, viewer]);

  // `initDefaultMatiere` : une seule matière dans l'établissement, elle est présélectionnée.
  useEffect(() => {
    if (matieres.length === 1) setSearch((s) => (s.matiere === null ? { ...s, matiere: matieres[0].id } : s));
  }, [matieres]);

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const chef = isChefEtabOrHeadTeacher(viewer);
  const matiere = matieres.find((m) => m.id === search.matiere);
  const rows = sortDevoirs(filterDevoirs(visible, search));
  const set = (patch: Partial<DevoirSearch>) => setSearch((s) => ({ ...s, ...patch }));

  const matiereName = (id: string) => matieres.find((m) => m.id === id)?.name ?? '';
  const sousMatiereName = (d: Devoir) =>
    d.id_sousmatiere === null ? '' : (sousMatieres.find((s) => s.id === Number(d.id_sousmatiere))?.libelle ?? '');
  const typeName = (id: number) => types.find((ty) => ty.id === id)?.nom ?? '';
  const columns = chef ? 8 : 7;

  return (
    <div className="d-flex flex-column gap-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16">
        <h1 className="h3 mb-0">{t('evaluations.test.list')}</h1>
        {rights.canCreateEval && (
          <Button color="primary" variant="filled" onClick={() => navigate('/devoir/create')}>
            {t('evaluations.test.new')}
          </Button>
        )}
      </div>

      {data.isError && <Alert type="danger">{t('competences.react.loading.error')}</Alert>}

      <section className="card p-16" aria-labelledby={`${nameId}-criteria`}>
        <h2 id={`${nameId}-criteria`} className="h5">
          {t('viescolaire.utils.criterion')}
        </h2>
        <div className="row g-12">
          <StructureSelect className="col-12 col-md-4" />
          <PeriodeSelect
            className="col-12 col-md-4"
            label={t('viescolaire.utils.periode')}
            periodes={periodesWithDevoirs(periodes, devoirs, search.classe)}
            value={search.periode}
            onChange={(periode) => set({ periode })}
          />
          <ClasseSelect
            className="col-12 col-md-4"
            label={t('viescolaire.utils.class.groupe')}
            emptyLabel={t('competences.react.all.classes')}
            classes={classOptions}
            value={search.classe}
            onChange={(classe) => set({ classe, matiere: null, sousmatiere: null })}
          />
          <SimpleSelect
            className="col-12 col-md-4"
            label={t('viescolaire.utils.subject')}
            emptyLabel={t('competences.react.all.subjects')}
            options={matiereOptions.map((m) => ({ value: m.id, label: m.name }))}
            value={search.matiere}
            onChange={(value) => set({ matiere: value, sousmatiere: null })}
          />
          {matiere?.sousMatieres && matiere.sousMatieres.length > 0 && (
            <SimpleSelect
              className="col-12 col-md-4"
              label={t('viescolaire.utils.undersubject')}
              emptyLabel={t('competences.react.all.undersubjects')}
              options={matiere.sousMatieres.map((s) => ({ value: Number(s.id_type_sousmatiere), label: s.libelle }))}
              value={search.sousmatiere}
              onChange={(sousmatiere) => set({ sousmatiere })}
            />
          )}
          <SimpleSelect
            className="col-12 col-md-4"
            label={t('viescolaire.utils.type')}
            emptyLabel={t('competences.react.all.types')}
            options={types.map((ty) => ({ value: ty.id, label: ty.nom }))}
            value={search.type}
            onChange={(type) => set({ type })}
          />
          {chef && (
            <SimpleSelect
              className="col-12 col-md-4"
              label={t('viescolaire.utils.teacher')}
              emptyLabel={t('competences.react.all.teachers')}
              options={enseignants.map((e) => ({ value: e.id, label: e.displayName }))}
              value={search.enseignant}
              onChange={(enseignant) => set({ enseignant })}
            />
          )}
        </div>
      </section>

      {devoirs.length === 0 ? (
        <Alert type="info">{t('evaluation.list.empty')}</Alert>
      ) : (
        <section className="card p-16">
          <div className="d-flex flex-wrap align-items-end justify-content-between gap-12 mb-12">
            <h2 className="h5 mb-0">{t('evaluations.test.owner.list')}</h2>
            <div className="flex-fill" style={{ maxWidth: 360 }}>
              <label htmlFor={nameId} className="visually-hidden">
                {t('evaluations.filter.name')}
              </label>
              <input
                id={nameId}
                type="search"
                className="form-control"
                placeholder={`${t('evaluations.filter.name')}…`}
                value={search.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
          </div>
          <p className="text-muted small mb-8" role="status">
            {t('competences.react.devoirs.count', { count: rows.length })}
          </p>

          {rows.length === 0 ? (
            <p className="text-muted mb-0">{t('competences.react.devoirs.none.filtered')}</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">{t('viescolaire.utils.date')}</th>
                    <th scope="col">{t('viescolaire.utils.class.groupe')}</th>
                    <th scope="col">{t('viescolaire.utils.name')}</th>
                    <th scope="col" className="text-end">{t('evaluations.test.coefficient')}</th>
                    <th scope="col" className="text-end">{t('evaluations.skills.nb')}</th>
                    <th scope="col" className="text-end">{t('evaluations.test.percent')}</th>
                    {chef && <th scope="col">{t('evaluations.test.teacher')}</th>}
                    <th scope="col">
                      <span className="visually-hidden">{t('competences.react.devoir.details')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((d) => {
                    const openable = canOpenDevoir(d.id_groupe, matieres, classes, viewer);
                    const expanded = opened === d.id;
                    return (
                      <Fragment key={d.id}>
                        <tr>
                          <td className="text-nowrap">{formatDate(d.date)}</td>
                          <td>{d.nameClass}</td>
                          <td>
                            {openable ? (
                              <Link to={`/devoir/${d.id}`}>{d.name}</Link>
                            ) : (
                              <span title={t('competences.react.devoir.not.evaluable')}>{d.name}</span>
                            )}
                          </td>
                          <td className="text-end">{d.is_evaluated ? d.coefficient : 'N/A'}</td>
                          <td className="text-end">{d.nbcompetences}</td>
                          <td className="text-end">{d.percent ?? 0}%</td>
                          {chef && <td>{d.teacher}</td>}
                          <td className="text-end">
                            <Button
                              type="button"
                              color="tertiary"
                              variant="ghost"
                              size="sm"
                              aria-expanded={expanded}
                              aria-controls={`devoir-${d.id}-details`}
                              onClick={() => setOpened(expanded ? null : d.id)}
                            >
                              {t('competences.react.devoir.details')}
                            </Button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr id={`devoir-${d.id}-details`}>
                            <td colSpan={columns} className="bg-light">
                              <dl className="row mb-0 small">
                                <dt className="col-sm-3">{t('viescolaire.utils.subject')}</dt>
                                <dd className="col-sm-3">
                                  {matiereName(d.id_matiere)}
                                  {sousMatiereName(d) && ` (${sousMatiereName(d)})`}
                                </dd>
                                {d.is_evaluated && (
                                  <>
                                    <dt className="col-sm-3">{t('evaluations.test.ramenersur')}</dt>
                                    <dd className="col-sm-3">
                                      {t(d.ramener_sur ? 'evaluations.test.ramenersur.true' : 'evaluations.test.ramenersur.false')}
                                    </dd>
                                  </>
                                )}
                                <dt className="col-sm-3">{t('evaluations.test.date.mark.publication')}</dt>
                                <dd className="col-sm-3">{formatDate(d.date_publication)}</dd>
                                <dt className="col-sm-3">{t('viescolaire.utils.type')}</dt>
                                <dd className="col-sm-3">{typeName(d.id_type)}</dd>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > limit && (
            <div className="d-flex justify-content-center mt-12">
              <Button type="button" color="primary" variant="outline" onClick={() => setLimit((l) => l + MORE)}>
                {t('competences.react.devoirs.show.more')}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default DevoirsList;
