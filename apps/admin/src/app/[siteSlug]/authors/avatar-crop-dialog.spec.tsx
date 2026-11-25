import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

/**
 * UXP-003 — `AvatarCropDialog` em isolamento.
 *
 * `react-easy-crop` depende de layout real (o jsdom não mede nada); o stub
 * abaixo informa mídia/área de recorte ao montar e expõe `crop`/`zoom`
 * recebidos como atributos `data-*`, para os testes observarem o efeito
 * dos controles acessíveis (zoom, direção, restaurar). A geração real da
 * imagem (canvas) é coberta em browser real; aqui `cropAvatarImage` é
 * substituída. Mídia 300×300 e área 300×300: com zoom 1 não há folga para
 * mover; com zoom 2 a folga é de ±150px em cada eixo (mesma fórmula do
 * `restrictPosition` da biblioteca).
 */
jest.mock('react-easy-crop', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  function MockCropper(props: {
    crop: { x: number; y: number };
    zoom: number;
    initialCroppedAreaPixels?: unknown;
    cropperProps?: Record<string, unknown>;
    mediaProps?: { onError?: () => void };
    onMediaLoaded?: (size: unknown) => void;
    onCropSizeChange?: (size: unknown) => void;
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
    setCropperRef?: (ref: unknown) => void;
  }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      props.setCropperRef?.(ref);
      props.onMediaLoaded?.({ width: 300, height: 300, naturalWidth: 900, naturalHeight: 900 });
      props.onCropSizeChange?.({ width: 300, height: 300 });
      props.onCropComplete?.({ x: 10, y: 20, width: 50, height: 50 }, { x: 90, y: 180, width: 450, height: 450 });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement(
      'div',
      null,
      React.createElement('img', { alt: '', 'data-testid': 'mock-media', onError: props.mediaProps?.onError }),
      React.createElement('div', {
        ref,
        tabIndex: 0,
        'data-testid': 'mock-crop-area',
        'data-crop-x': String(props.crop.x),
        'data-crop-y': String(props.crop.y),
        'data-zoom': String(props.zoom),
        'data-initial-area': JSON.stringify(props.initialCroppedAreaPixels ?? null),
        ...props.cropperProps,
      }),
    );
  }
  return { __esModule: true, default: MockCropper };
});

jest.mock('./crop-avatar-image', () => ({
  ...jest.requireActual<typeof import('./crop-avatar-image')>('./crop-avatar-image'),
  cropAvatarImage: jest.fn(),
}));

const { cropAvatarImage: cropAvatarImageMock } = jest.requireMock<{
  cropAvatarImage: jest.Mock<(sourceUrl: string, area: unknown) => Promise<File>>;
}>('./crop-avatar-image');

// Import dinâmico depois dos mocks — mesmo motivo documentado em
// `author-form.spec.tsx`.
let AvatarCropDialog: typeof import('./avatar-crop-dialog').AvatarCropDialog;

beforeAll(async () => {
  ({ AvatarCropDialog } = await import('./avatar-crop-dialog'));
});

const CROPPED_FILE = new File(['recortado'], 'avatar.webp', { type: 'image/webp' });

type ApplyFn = (file: File, area: { x: number; y: number; width: number; height: number }) => void;

const APPLIED_AREA = { x: 90, y: 180, width: 450, height: 450 };

function renderDialog(
  overrides: {
    onApply?: ApplyFn;
    onCancel?: () => void;
    initialCroppedAreaPixels?: { x: number; y: number; width: number; height: number } | null;
  } = {},
) {
  const returnFocusRef = createRef<HTMLButtonElement>();
  const onApply = overrides.onApply ?? jest.fn<ApplyFn>();
  const onCancel = overrides.onCancel ?? jest.fn<() => void>();
  const result = render(
    <>
      <button ref={returnFocusRef} type="button">
        Gatilho
      </button>
      <AvatarCropDialog
        imageUrl="blob:original"
        returnFocusRef={returnFocusRef}
        initialCroppedAreaPixels={overrides.initialCroppedAreaPixels}
        onApply={onApply}
        onCancel={onCancel}
      />
    </>,
  );
  return { ...result, onApply, onCancel, returnFocusRef };
}

function cropArea() {
  return screen.getByTestId('mock-crop-area');
}

describe('AvatarCropDialog (UXP-003)', () => {
  beforeEach(() => {
    cropAvatarImageMock.mockReset();
    cropAvatarImageMock.mockResolvedValue(CROPPED_FILE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('é um diálogo modal aberto, rotulado pelo título e descrito pelas instruções', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription(/Arraste a imagem ou use as setas do teclado/);
  });

  it('foco inicial vai para a área de recorte assim que ela existe, com nome acessível e instruções', async () => {
    renderDialog();
    await waitFor(() => expect(cropArea()).toHaveFocus());
    expect(cropArea()).toHaveAttribute('role', 'group');
    expect(cropArea()).toHaveAccessibleName('Área de recorte: use as setas para mover a imagem');
    expect(cropArea()).toHaveAccessibleDescription(/Arraste a imagem/);
  });

  it('zoom: range rotulado de 1 a 3, passo 0,1, com valor textual em %; botões respeitam os limites', async () => {
    const user = userEvent.setup();
    renderDialog();
    const slider = await screen.findByRole('slider', { name: 'Zoom' });
    await waitFor(() => expect(slider).toBeEnabled());
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('step', '0.1');
    expect(slider).toHaveAttribute('aria-valuetext', '100%');
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Aumentar zoom' }));
    expect(slider).toHaveValue('1.1');
    expect(slider).toHaveAttribute('aria-valuetext', '110%');
    expect(cropArea()).toHaveAttribute('data-zoom', '1.1');

    fireEvent.change(slider, { target: { value: '3' } });
    expect(cropArea()).toHaveAttribute('data-zoom', '3');
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toBeDisabled();
  });

  it('teclado no range: setas mudam o zoom (controle nativo)', async () => {
    const user = userEvent.setup();
    renderDialog();
    const slider = await screen.findByRole('slider', { name: 'Zoom' });
    await waitFor(() => expect(slider).toBeEnabled());
    slider.focus();
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(cropArea()).toHaveAttribute('data-zoom', '1.5');
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toHaveFocus();
  });

  it('botões de direção (alternativa de ponteiro único ao arraste, WCAG 2.5.7) movem a imagem dentro dos limites', async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mover imagem para cima' })).toBeEnabled());

    // Zoom 1: imagem já preenche a área — nenhuma folga, posição não muda.
    await user.click(screen.getByRole('button', { name: 'Mover imagem para cima' }));
    expect(cropArea()).toHaveAttribute('data-crop-y', '0');

    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: 'Mover imagem para cima' }));
    await user.click(screen.getByRole('button', { name: 'Mover imagem para a direita' }));
    expect(cropArea()).toHaveAttribute('data-crop-y', '-10');
    expect(cropArea()).toHaveAttribute('data-crop-x', '10');
    await user.click(screen.getByRole('button', { name: 'Mover imagem para baixo' }));
    await user.click(screen.getByRole('button', { name: 'Mover imagem para a esquerda' }));
    expect(cropArea()).toHaveAttribute('data-crop-y', '0');
    expect(cropArea()).toHaveAttribute('data-crop-x', '0');

    // Grupo rotulado e alvos de toque de 44px.
    const group = screen.getByRole('group', { name: 'Mover imagem' });
    for (const button of within(group).getAllByRole('button')) {
      expect(button).toHaveClass('h-11', 'w-11');
    }
  });

  it('reduzir o zoom reposiciona a imagem para dentro dos limites', async () => {
    const user = userEvent.setup();
    renderDialog();
    const slider = await screen.findByRole('slider', { name: 'Zoom' });
    await waitFor(() => expect(slider).toBeEnabled());
    fireEvent.change(slider, { target: { value: '2' } });
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Mover imagem para a direita' }));
    }
    expect(cropArea()).toHaveAttribute('data-crop-x', '30');
    fireEvent.change(slider, { target: { value: '1' } });
    expect(cropArea()).toHaveAttribute('data-crop-x', '0');
  });

  it('Restaurar enquadramento volta a zoom 1 e posição central', async () => {
    const user = userEvent.setup();
    renderDialog();
    const slider = await screen.findByRole('slider', { name: 'Zoom' });
    await waitFor(() => expect(slider).toBeEnabled());
    fireEvent.change(slider, { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: 'Mover imagem para cima' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar enquadramento' }));
    expect(cropArea()).toHaveAttribute('data-zoom', '1');
    expect(cropArea()).toHaveAttribute('data-crop-y', '0');
  });

  it('prévia circular do resultado posicionada pela área recortada', async () => {
    renderDialog();
    const preview = await screen.findByRole('img', { name: 'Prévia do avatar recortado' });
    expect(preview).toHaveClass('rounded-pill');
    await waitFor(() => expect(preview.style.backgroundImage).toBe('url("blob:original")'));
    // área 50% a partir de (10%, 20%): tamanho 200%, posição 20%/40%.
    expect(preview.style.backgroundSize).toBe('200% auto');
    expect(preview.style.backgroundPosition).toBe('20% 40%');
  });

  it('Aplicar recorte: gera a imagem a partir da área em pixels, fecha, devolve o foco e entrega o File', async () => {
    const user = userEvent.setup();
    const { onApply, returnFocusRef } = renderDialog();
    const apply = await screen.findByRole('button', { name: 'Aplicar recorte' });
    await waitFor(() => expect(apply).toBeEnabled());

    await user.click(apply);

    // Entrega o arquivo E a área usada (para retomar o enquadramento depois).
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(CROPPED_FILE, APPLIED_AREA));
    expect(cropAvatarImageMock).toHaveBeenCalledWith('blob:original', APPLIED_AREA);
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
    expect(returnFocusRef.current).toHaveFocus();
  });

  /** Geração que só termina quando o teste mandar. */
  function pendingCrop() {
    let resolve!: (file: File) => void;
    let reject!: (error: Error) => void;
    cropAvatarImageMock.mockReturnValueOnce(
      new Promise<File>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );
    return { resolve: (file: File) => resolve(file), reject: (error: Error) => reject(error) };
  }

  async function startPendingApply(user: ReturnType<typeof userEvent.setup>) {
    const apply = await screen.findByRole('button', { name: 'Aplicar recorte' });
    await waitFor(() => expect(apply).toBeEnabled());
    await user.click(apply);
    expect(await screen.findByRole('status')).toHaveTextContent('Gerando imagem recortada...');
    return apply;
  }

  it('durante a geração: status anunciado, Aplicar desabilitado e Cancelar disponível', async () => {
    const pending = pendingCrop();
    const user = userEvent.setup();
    const { onApply } = renderDialog();

    const apply = await startPendingApply(user);
    expect(apply).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();

    pending.resolve(CROPPED_FILE);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });

  it('Cancelar durante a geração: fecha, devolve o foco e descarta o resultado que chega depois', async () => {
    const pending = pendingCrop();
    const user = userEvent.setup();
    const { onApply, onCancel, returnFocusRef } = renderDialog();

    await startPendingApply(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
    expect(returnFocusRef.current).toHaveFocus();

    pending.resolve(CROPPED_FILE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Escape durante a geração: cancela e descarta o erro que chega depois (sem alerta)', async () => {
    const pending = pendingCrop();
    const user = userEvent.setup();
    const { onApply, onCancel } = renderDialog();

    await startPendingApply(user);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    pending.reject(new Error('canvas'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('alert', { hidden: true })).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('desmontado durante a geração: o resultado tardio nunca chega a onApply', async () => {
    const pending = pendingCrop();
    const user = userEvent.setup();
    const { onApply, unmount } = renderDialog();

    await startPendingApply(user);
    unmount();

    pending.resolve(CROPPED_FILE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('retomar enquadramento: repassa ao cropper a área do último recorte aplicado; sem ela, começa do centro', async () => {
    const first = renderDialog({ initialCroppedAreaPixels: APPLIED_AREA });
    expect(await screen.findByTestId('mock-crop-area')).toHaveAttribute('data-initial-area', JSON.stringify(APPLIED_AREA));
    first.unmount();

    renderDialog();
    expect(await screen.findByTestId('mock-crop-area')).toHaveAttribute('data-initial-area', 'null');
  });

  it('Cancelar e Escape: fecham sem gerar imagem e devolvem o foco', async () => {
    const user = userEvent.setup();
    const first = renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    expect(first.returnFocusRef.current).toHaveFocus();
    first.unmount();

    const second = renderDialog();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(second.onCancel).toHaveBeenCalledTimes(1);
    expect(second.returnFocusRef.current).toHaveFocus();
    expect(cropAvatarImageMock).not.toHaveBeenCalled();
  });

  it('imagem que não abre: alerta, controles e Aplicar desabilitados, Cancelar disponível', async () => {
    renderDialog();
    fireEvent.error(await screen.findByTestId('mock-media'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir esta imagem. Escolha outro arquivo.');
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Zoom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderDialog();
    await waitFor(() => expect(cropArea()).toHaveFocus());
    expect(await axe(container)).toHaveNoViolations();
  });
});
