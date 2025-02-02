/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { StatusCodes } from 'http-status-codes';
import AppError from '../../app/errors/AppError';
import BiCycle from '../biCycle_product/biCycle-product.model';
import { User } from '../users/user.model';
import { TOrderBiCycle } from './biCycle-order.interface';
import { OrderBiCycleModel } from './biCycle.-order.model';
import mongoose from 'mongoose';

// const createOrderBiCycleService = async (
//   data: TOrderBiCycle,
//   id: string,
// ): Promise<TOrderBiCycle> => {
//   const userId = await User.findById(id);
//   if (!userId) {
//     throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
//   }

//   const { product, quantity } = data;
//   const bicycle = await BiCycle.findById(product);

//   if (!bicycle) {
//     throw new Error('Product not found');
//   }

//   if (bicycle.quantity < quantity) {
//     throw new Error('Insufficient stock for the requested product.');
//   }

//   bicycle.quantity -= quantity;
//   bicycle.inStock = bicycle.quantity > 0;

//   await bicycle.save();

//   // const result = await OrderBiCycleModel.create(data);
//   const orderData = { ...data, customer: userId?._id };
//   const result = (await OrderBiCycleModel.create(orderData)).populate(
//     'customer',
//     'name email role',
//   );

//   return result;
// };

const createOrderBiCycleService = async (
  data: TOrderBiCycle,
  userId: string,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  // try {
  // Validate user existence
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const { product, quantity } = data;

  // Ensure required fields are not null
  // if (!data.customer) {
  //   data.customer = user._id;
  // }

  // Ensure email is set if required by schema
  if (!data.email) {
    data.email = user.email;
  }

  // Atomically check stock and update
  const bicycle = await BiCycle.findOneAndUpdate(
    { _id: product, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity }, $set: { inStock: true } },
    { new: true, session },
  );

  if (!bicycle) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Insufficient stock or product not found.',
    );
  }

  // Create order with customer information
  const orderData = { ...data, customer: user._id };
  const result = await OrderBiCycleModel.create([orderData], { session });
  await result[0].populate('customer', 'name email role');

  await session.commitTransaction();
  session.endSession();
  return result[0];
  // } catch (error) {
  //   await session.abortTransaction();
  //   session.endSession();
  //   throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, error.message);
  // }
};

const getBiCycleOrder = async (): Promise<{ totalRevenue: number }> => {
  const result = await OrderBiCycleModel.aggregate([
    {
      $lookup: {
        from: 'bicycles',
        localField: 'product',
        foreignField: '_id',
        as: 'bicycleDetails',
      },
    },
    {
      $unwind: '$bicycleDetails',
    },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $multiply: ['$bicycleDetails.price', '$quantity'],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalRevenue: 1,
      },
    },
  ]);
  return result[0] || { totalRevenue: 0 };
};

export const orderBiCycleService = {
  createOrderBiCycleService,
  getBiCycleOrder,
};
