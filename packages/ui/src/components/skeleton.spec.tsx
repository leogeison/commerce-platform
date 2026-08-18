import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('always has aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps aria-hidden="true" regardless of other props passed through', () => {
    const { container } = render(<Skeleton data-testid="loading-block" variant="block" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveAttribute('data-testid', 'loading-block');
  });

  it('applies the pill radius for the circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />);
    expect(container.firstChild).toHaveClass('rounded-pill');
  });

  it('applies the control radius for text/block variants', () => {
    const { container: textContainer } = render(<Skeleton variant="text" />);
    expect(textContainer.firstChild).toHaveClass('rounded-control');
  });

  it('preserves internal classes while appending consumer className', () => {
    const { container } = render(<Skeleton className="custom-extra" />);
    expect(container.firstChild).toHaveClass('bg-skeleton', 'rounded-control', 'custom-extra');
  });

  it('keeps aria-hidden="true" even if a caller bypasses the type system and injects their own aria-hidden', () => {
    // SkeletonProps omits 'aria-hidden' at the type level, so this requires an
    // explicit cast — a caller in plain JS, or one using `as unknown as ...`,
    // could still do this at runtime. The component must not trust `rest`.
    const bypass = { 'aria-hidden': 'false' } as unknown as { 'data-bypass': string };
    const { container } = render(<Skeleton {...bypass} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no axe-detectable accessibility violations', async () => {
    const { container } = render(<Skeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Skeleton — type-level invariant', () => {
  it('rejects an explicit aria-hidden prop on a direct object-literal assignment (see @ts-expect-error below)', () => {
    // NOTE: `Omit<React.HTMLAttributes<HTMLDivElement>, 'aria-hidden'>` blocks
    // 'aria-hidden' on a direct object-literal assignment to SkeletonProps (as
    // asserted below), but TypeScript does NOT apply the same excess-property
    // check to JSX attributes containing a hyphen (e.g. `<Skeleton aria-hidden="false" />`)
    // on custom components — this is a documented TS/JSX language exemption for
    // hyphenated attribute names, not a gap in this component's types. See the
    // runtime test above for the actual, unconditional guarantee.
    function TypeOnlyCheck() {
      // @ts-expect-error aria-hidden is omitted from SkeletonProps — direct object assignment is rejected.
      const props: import('./skeleton').SkeletonProps = { 'aria-hidden': 'false' };
      return props;
    }
    expect(TypeOnlyCheck).toBeDefined();
  });
});
