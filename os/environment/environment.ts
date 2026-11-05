export type Variable = {
  readonly name: string;
  readonly value: string;
};

// The variables of one command interpreter, in the order they were added.
export type Environment = readonly Variable[];

export const EMPTY_ENVIRONMENT: Environment = [];

const sameName = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

export const getVariable = (
  environment: Environment,
  name: string,
): string | undefined =>
  environment.find((variable) => sameName(variable.name, name))?.value;

export const removeVariable = (
  environment: Environment,
  name: string,
): Environment => environment.filter((variable) => !sameName(variable.name, name));

// MS-DOS deletes the old entry and adds the new one at the end, so a variable
// that is set again moves to the end of the list.
export const setVariable = (
  environment: Environment,
  name: string,
  value: string,
): Environment => [
  ...removeVariable(environment, name),
  { name: name.toUpperCase(), value },
];

export const listVariables = (environment: Environment): readonly string[] =>
  environment.map(({ name, value }) => `${name}=${value}`);
