import { useCallback, useState, useEffect, useRef } from "react";
import { ApiService } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuthContext";
import { Plus, MapPin, Trash2, Edit } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface Warehouse {
  id: string;
  name: string;
  location_address: string | null;
  is_main: boolean;
  is_active: boolean;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function Locations() {
  const { role } = useAuth();
  const [locations, setLocations] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(false);
  const hasShownLoadError = useRef(false);
  const [formData, setFormData] = useState({
    name: "",
    location_address: "",
    is_main: false,
  });

  const isAdmin = role === "admin";

  const loadLocations = useCallback(async () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setIsLoading(true);

    try {
      const data = await ApiService.get<Warehouse[]>("/warehouses");
      if (!isMounted.current) return;
      // sort by is_main first, then name
      data.sort((a, b) => {
        if (a.is_main && !b.is_main) return -1;
        if (!a.is_main && b.is_main) return 1;
        return a.name.localeCompare(b.name);
      });
      setLocations(data);
      setLoadError(false);
      hasShownLoadError.current = false;
    } catch (error) {
      if (!isMounted.current) return;
      setLoadError(true);
      if (!hasShownLoadError.current) {
        toast.error(getErrorMessage(error, "Failed to load locations"));
        hasShownLoadError.current = true;
      }
      retryTimer.current = setTimeout(() => void loadLocations(), 5000);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadLocations();

    return () => {
      isMounted.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [loadLocations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await ApiService.put(`/warehouses/${editingId}`, formData);
        toast.success("Location updated");
      } else {
        await ApiService.post("/warehouses", formData);
        toast.success("Location added");
      }
      resetForm();
      loadLocations();
    } catch (error) {
      toast.error(getErrorMessage(error, "Error saving location"));
    }
  };

  const resetForm = () => {
    setFormData({ name: "", location_address: "", is_main: false });
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleEdit = (location: Warehouse) => {
    setFormData({
      name: location.name,
      location_address: location.location_address || "",
      is_main: location.is_main,
    });
    setEditingId(location.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this location?")) return;

    try {
      await ApiService.delete(`/warehouses/${id}`);
      toast.success("Location deactivated");
      loadLocations();
    } catch (error) {
      toast.error(getErrorMessage(error, "Error deactivating location"));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Store Locations</h1>
          <p className="text-muted-foreground">
            Manage your store locations and warehouses
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Location" : "Add New Location"}
                </DialogTitle>
                <DialogDescription>
                  Add or update the name, address, and main location status.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Location Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="location_address">Address</Label>
                  <Input
                    id="location_address"
                    value={formData.location_address}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        location_address: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_main"
                    checked={formData.is_main}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_main: checked })
                    }
                  />
                  <Label htmlFor="is_main">Main Location</Label>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingId ? "Update" : "Add"} Location
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loadError && locations.length === 0 && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-md border p-4"
        >
          <p>Could not load store locations. Retrying automatically.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadLocations()}
          >
            Retry
          </Button>
        </div>
      )}
      {isLoading && locations.length === 0 && !loadError && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading locations...
        </p>
      )}
      {!isLoading && !loadError && locations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No store locations found.
        </p>
      )}
      {locations.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  {location.name}
                </CardTitle>
                {isAdmin && (
                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${location.name}`}
                      onClick={() => handleEdit(location)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Deactivate ${location.name}`}
                      onClick={() => handleDelete(location.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {location.is_main && (
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                      Main Location
                    </span>
                  </div>
                )}
                {location.location_address && (
                  <p className="text-sm text-muted-foreground mb-1">
                    {location.location_address}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
