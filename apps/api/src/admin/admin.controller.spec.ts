import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: {
    listWithdraws: jest.Mock;
    approveWithdraw: jest.Mock;
    rejectWithdraw: jest.Mock;
  };

  const req = { user: { sub: 'admin-1' } };

  beforeEach(async () => {
    adminService = {
      listWithdraws: jest.fn(),
      approveWithdraw: jest.fn(),
      rejectWithdraw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listWithdraws() forwards the status filter to AdminService', () => {
    controller.listWithdraws('PENDING');

    expect(adminService.listWithdraws).toHaveBeenCalledWith('PENDING');
  });

  it('approve() passes the withdraw id and the authenticated admin id', () => {
    controller.approve(req as any, 'wr-1');

    expect(adminService.approveWithdraw).toHaveBeenCalledWith(
      'wr-1',
      'admin-1',
    );
  });

  it('reject() passes the withdraw id and the authenticated admin id', () => {
    controller.reject(req as any, 'wr-1');

    expect(adminService.rejectWithdraw).toHaveBeenCalledWith('wr-1', 'admin-1');
  });
});
