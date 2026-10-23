import { defaultView, resolveGroupField } from './board';
import type { ProjectDetails, ProjectItem } from './types';

/**
 * Items assigned to `login` whose column (the project's Status-like field) is `columnName`,
 * compared case-insensitively ("In progress" matches "In Progress").
 */
export function countMine(project: ProjectDetails, items: ProjectItem[], login: string, columnName: string): number {
  const field = resolveGroupField(project.fields, defaultView(project));
  if (!field || !login) return 0;
  const option = field.options?.find((o) => o.name.trim().toLowerCase() === columnName.trim().toLowerCase());
  if (!option) return 0;
  const me = login.toLowerCase();
  return items.filter((item) => {
    const v = item.fieldValues[field.id];
    return v?.kind === 'singleSelect' && v.optionId === option.id && item.assignees.some((a) => a.login.toLowerCase() === me);
  }).length;
}
