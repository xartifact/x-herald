'use client';

import { useState, useEffect } from 'react';
import AdminNav from '@/components/admin/AdminNav';

interface Provider {
  id: string;
  name: string;
}

interface Model {
  id: string;
  name: string;
  displayName: string;
  actualModelName: string;
  providerId: string;
  enabled: boolean;
  routingConfig: {
    strategy: string;
    fallbackEnabled: boolean;
  };
  protocolConversion: {
    enabled: boolean;
    targetProtocol: string;
  };
  createdAt: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    actualModelName: '',
    providerId: '',
    enabled: true,
    routingStrategy: 'round_robin' as 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'smart',
    fallbackEnabled: true,
    protocolConversionEnabled: false,
    targetProtocol: 'openai' as 'openai' | 'anthropic' | 'gemini',
  });

  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setModels(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/providers', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProviders(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  };

  useEffect(() => {
    fetchModels();
    fetchProviders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          displayName: formData.displayName,
          actualModelName: formData.actualModelName,
          providerId: formData.providerId,
          enabled: formData.enabled,
          routingConfig: {
            strategy: formData.routingStrategy,
            fallbackEnabled: formData.fallbackEnabled,
          },
          protocolConversion: {
            enabled: formData.protocolConversionEnabled,
            targetProtocol: formData.targetProtocol,
          },
        }),
      });

      if (response.ok) {
        setShowAddForm(false);
        setFormData({
          name: '',
          displayName: '',
          actualModelName: '',
          providerId: '',
          enabled: true,
          routingStrategy: 'round_robin',
          fallbackEnabled: true,
          protocolConversionEnabled: false,
          targetProtocol: 'openai',
        });
        fetchModels();
      } else {
        const error = await response.json();
        alert(`创建失败: ${error.error}`);
      }
    } catch (error) {
      alert('网络错误');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此模型吗？')) return;

    try {
      const response = await fetch(`/api/models/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchModels();
      } else {
        alert('删除失败');
      }
    } catch (error) {
      alert('网络错误');
    }
  };

  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.name || '未知供应商';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">模型管理</h2>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + 添加模型
            </button>
          </div>

          {/* 添加模型表单 */}
          {showAddForm && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-medium mb-4">添加模型</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        模型名称 (唯一标识) *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        placeholder="gpt-4"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        用于 API 调用的模型名称
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        显示名称 *
                      </label>
                      <input
                        type="text"
                        value={formData.displayName}
                        onChange={(e) =>
                          setFormData({ ...formData, displayName: e.target.value })
                        }
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        placeholder="GPT-4"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        实际模型名称 *
                      </label>
                      <input
                        type="text"
                        value={formData.actualModelName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            actualModelName: e.target.value,
                          })
                        }
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        placeholder="gpt-4-turbo-preview"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        供应商的实际模型名称
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        供应商 *
                      </label>
                      <select
                        value={formData.providerId}
                        onChange={(e) =>
                          setFormData({ ...formData, providerId: e.target.value })
                        }
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        required
                      >
                        <option value="">选择供应商</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      路由配置
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          路由策略
                        </label>
                        <select
                          value={formData.routingStrategy}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              routingStrategy: e.target.value as any,
                            })
                          }
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="round_robin">轮询</option>
                          <option value="weighted">加权</option>
                          <option value="least_latency">最低延迟</option>
                          <option value="priority">优先级</option>
                          <option value="smart">智能路由</option>
                        </select>
                      </div>

                      <div className="flex items-center pt-6">
                        <input
                          type="checkbox"
                          checked={formData.fallbackEnabled}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              fallbackEnabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          启用故障转移
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      协议转换
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.protocolConversionEnabled}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              protocolConversionEnabled: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          启用协议转换
                        </label>
                      </div>

                      {formData.protocolConversionEnabled && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            目标协议
                          </label>
                          <select
                            value={formData.targetProtocol}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                targetProtocol: e.target.value as any,
                              })
                            }
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                          >
                            <option value="openai">OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Gemini</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center border-t pt-4">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) =>
                        setFormData({ ...formData, enabled: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600"
                    />
                    <label className="ml-2 text-sm text-gray-700">启用模型</label>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                    >
                      创建
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
                    >
                      取消
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 模型列表 */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : models.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <p className="text-gray-500 mb-4">还没有模型</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="text-blue-600 hover:underline"
              >
                添加第一个模型
              </button>
            </div>
          ) : (
            <div className="bg-white shadow-sm overflow-hidden sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      模型信息
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      供应商
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      路由策略
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {model.displayName}
                        </div>
                        <div className="text-sm text-gray-500">{model.name}</div>
                        <div className="text-xs text-gray-400">
                          实际: {model.actualModelName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {getProviderName(model.providerId)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {model.routingConfig.strategy}
                        </div>
                        {model.routingConfig.fallbackEnabled && (
                          <div className="text-xs text-green-600">
                            故障转移已启用
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            model.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {model.enabled ? '启用' : '禁用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(model.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(model.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
