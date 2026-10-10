import { Alert } from '@open-ent/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { byDateDesc, currentPeriode, FamilyChild, FamilyDevoir, filterDevoirs, matieresOf, resultOf } from '../family';
import { todayLocal, useChildData, useFamily } from '../familyContext';
import { CompetenceBubbles, FamilyCriteria, WithChild } from '../features/FamilyParts';
import { formatDate } from '../rules';

type ChildData = ReturnType<typeof useChildData>;

/** Critères partagés par l'accueil et la liste : période en cours, matière unique pré-choisie. */
function useFamilySearch(data: ChildData) {
  const [periode, setPeriode] = useState<number | null>(() => currentPeriode(data.periodes, todayLocal()));
  const matieres = useMemo(() => matieresOf(data.devoirs, data.matiereNames), [data.devoirs, data.matiereNames]);
  const [matiere, setMatiere] = useState<string | null>(null);
  // Une seule matière : elle est choisie d'office (`initDefaultMatiere`).
  useEffect(() => {
    if (matieres.length === 1) setMatiere(matieres[0].id);
  }, [matieres]);
  return { periode, setPeriode, matieres, matiere, setMatiere };
}

/**
 * Accueil (`eval_parent_acu.html`) : les évaluations de l'enfant pour une période et une matière,
 * la plus récente d'abord, avec un lien vers la liste complète.
 */
export function FamilyHome() {
  return <WithChild render={(child, data) => <HomeView child={child} data={data} />} />;
}

function HomeView({ child, data }: { child: FamilyChild; data: ChildData }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { isParent } = useFamily();
  const search = useFamilySearch(data);
  const devoirs = filterDevoirs(data.devoirs, { periode: search.periode, matiere: search.matiere }).sort(byDateDesc);
  return (
    <section className="card p-16 d-flex flex-column gap-12">
      <h1 className="h4 mb-0">
        {isParent ? `${t('evaluations.evaluations.par.periode.par.matiere')} — ${child.firstName}` : t('evaluations.mes.evaluations')}
      </h1>
      <FamilyCriteria
        periodes={data.periodes}
        periode={search.periode}
        onPeriode={search.setPeriode}
        matieres={search.matieres}
        matiere={search.matiere}
        onMatiere={search.setMatiere}
      />
      <DevoirsTable devoirs={devoirs} data={data} compact />
      <div className="text-end">
        <Link to="/devoirs/list">{t('show.more')}</Link>
      </div>
    </section>
  );
}

/**
 * Liste des évaluations (`display_devoirs_structure.html`, `list_view.html`) : critères, recherche
 * par nom, tri par colonne, et accès à la fiche de chaque devoir.
 */
export function FamilyDevoirs() {
  return <WithChild render={(child, data) => <ListView child={child} data={data} />} />;
}

function ListView({ data }: { child: FamilyChild; data: ChildData }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { isParent } = useFamily();
  const search = useFamilySearch(data);
  const [enseignant, setEnseignant] = useState<string | null>(null);
  const [name, setName] = useState('');
  const teachers = useMemo(
    () =>
      [...new Map(data.devoirs.map((d) => [d.owner, data.teacherOf(d)])).entries()]
        .filter(([, n]) => n)
        .sort((a, b) => a[1].localeCompare(b[1])),
    [data],
  );
  const devoirs = filterDevoirs(data.devoirs, { periode: search.periode, matiere: search.matiere, enseignant, name });
  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.test.list')}</h1>
      <section className="card p-16">
        <h2 className="h6">{t('viescolaire.utils.criterion')}</h2>
        <FamilyCriteria
          periodes={data.periodes}
          periode={search.periode}
          onPeriode={search.setPeriode}
          matieres={search.matieres}
          matiere={search.matiere}
          onMatiere={search.setMatiere}
        >
          {/* L'AngularJS ne proposait le filtre par enseignant qu'à l'élève. */}
          {!isParent && (
            <div className="col-12 col-md-4">
              <label htmlFor="famille-enseignant" className="form-label">
                {t('viescolaire.utils.teacher')}
              </label>
              <select id="famille-enseignant" className="form-select" value={enseignant ?? ''} onChange={(e) => setEnseignant(e.target.value || null)}>
                <option value="">—</option>
                {teachers.map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </FamilyCriteria>
      </section>
      <section className="card p-16 d-flex flex-column gap-12">
        <h2 className="h5 mb-0">{t('evaluations.test.owner.list')}</h2>
        <input
          type="search"
          className="form-control"
          aria-label={t('evaluations.filter.name')}
          placeholder={`${t('evaluations.filter.name')}…`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <DevoirsTable devoirs={devoirs} data={data} />
      </section>
    </div>
  );
}

type SortKey = 'date' | 'matiere' | 'name' | 'enseignant' | 'competences' | 'note';

function DevoirsTable({ devoirs, data, compact }: { devoirs: FamilyDevoir[]; data: ChildData; compact?: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  if (devoirs.length === 0) return <Alert type="info">{t('evaluation.student.list.empty')}</Alert>;

  const matiere = (d: FamilyDevoir) => {
    const sous = data.sousMatiere(d.id_matiere, d.id_sousmatiere);
    return `${data.matiereNames.get(d.id_matiere) ?? ''}${sous ? ` (${sous})` : ''}`;
  };
  const value = (d: FamilyDevoir): string | number => {
    switch (sort.key) {
      case 'date':
        return d.date;
      case 'matiere':
        return matiere(d);
      case 'name':
        return d.name;
      case 'enseignant':
        return data.teacherOf(d);
      case 'competences':
        return d.competences.length;
      case 'note':
        return d.annotation ? -1 : Number(d.note ?? -2);
    }
  };
  const sorted = compact
    ? devoirs
    : [...devoirs].sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return sort.desc ? -c : c;
      });
  const header = (key: SortKey, label: string) =>
    compact ? (
      <th scope="col">{t(label)}</th>
    ) : (
      <th scope="col" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
        <button
          type="button"
          className="btn btn-link p-0 fw-bold text-reset text-decoration-none"
          onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
        >
          {t(label)}
          {sort.key === key && <span aria-hidden="true">{sort.desc ? ' ▼' : ' ▲'}</span>}
        </button>
      </th>
    );

  return (
    <div className={`table-responsive ${compact ? 'competences-scroll' : ''}`}>
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr>
            {header('date', 'viescolaire.utils.date')}
            {header('matiere', 'viescolaire.utils.subject')}
            {!compact && header('name', 'viescolaire.utils.name')}
            {!compact && header('enseignant', 'viescolaire.utils.teacher')}
            {header('note', 'viescolaire.evaluation.note')}
            {header('competences', 'evaluations.competences.title')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/devoir/${d.id}`)}>
              <td>
                <Link to={`/devoir/${d.id}`} onClick={(e) => e.stopPropagation()} title={`${d.name} - ${data.teacherOf(d)}`}>
                  {formatDate(d.date)}
                </Link>
              </td>
              <td>{matiere(d)}</td>
              {!compact && <td>{d.name}</td>}
              {!compact && <td>{data.teacherOf(d)}</td>}
              <td title={d.annotation?.libelle}>{resultOf(d)}</td>
              <td>
                <CompetenceBubbles competences={d.competences} levels={data.levels} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default FamilyDevoirs;
